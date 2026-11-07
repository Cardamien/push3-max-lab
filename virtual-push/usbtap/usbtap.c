// usbtap: a drop-in libusb-1.0.dylib for the Push 3 helper that forwards every call to the
// real library (libusb-1.0.real.dylib beside it), so the real Push keeps working, and copies
// every screen frame the helper sends to the Mac. It is a screen capture of the real Push.
//
// Sinks (all in $USBTAP_DIR, default $TMPDIR/push-tap):
//   frame.bin  latest frame, 960x160 BGR565 little-endian, stride 1920 (tmp + rename, never torn),
//              written at most $USBTAP_FPS times a second (default 30) by a worker thread
//   TCP        the same frames as a 960x160 ARGB char matrix to [jit.net.recv @port $USBTAP_PORT]
//              (default 7474), jit.net.send wire format, dropped while nothing listens
//   rec.log    while the file rec.on exists: one line per frame sent to the Push, unthrottled,
//              "<unix time> <fnv1a-32 of the frame's pixels>", to count distinct frames per second
//   rec.bin    while rec.on and rec.full both exist: every frame whose hash changed, as
//              8-byte double time + 307200 bytes decoded BGR565
//   usbtap.log one line at load, open/claim, and a frame count every 500 frames
//
// Build: clang -arch arm64 -arch x86_64 -dynamiclib -O2 -o libusb-1.0.dylib \
//        -install_name @rpath/libusb-1.0.dylib usbtap.c
#include <arpa/inet.h>
#include <dlfcn.h>
#include <errno.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <pthread.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>

// --- minimal libusb types (ABI of libusb 1.0.2x) ---------------------------
typedef struct libusb_context libusb_context;
typedef struct libusb_device libusb_device;
typedef struct libusb_device_handle libusb_device_handle;
struct libusb_device_descriptor;
struct libusb_transfer;
typedef void (*libusb_transfer_cb_fn)(struct libusb_transfer *);
struct libusb_iso_packet_descriptor { unsigned int length, actual_length; int status; };
struct libusb_transfer {
    libusb_device_handle *dev_handle; uint8_t flags; unsigned char endpoint;
    unsigned char type; unsigned int timeout; int status; int length;
    int actual_length; libusb_transfer_cb_fn callback; void *user_data;
    unsigned char *buffer; int num_iso_packets;
    struct libusb_iso_packet_descriptor iso_packet_desc[0];
};
struct timeval;

#define FRAME_BYTES 327680
#define LINE_BYTES 2048
#define LINE_PIXELS 960
#define LINES 160
#define OUT_BYTES (LINES * LINE_PIXELS * 2)

static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static FILE *lg;
static char dir[1024];
static double now(void) { struct timeval tv; gettimeofday(&tv, 0); return tv.tv_sec + tv.tv_usec / 1e6; }
static void tl(const char *fmt, ...) {
    if (!lg) return;
    pthread_mutex_lock(&mu);
    fprintf(lg, "%.6f ", now());
    va_list ap; va_start(ap, fmt); vfprintf(lg, fmt, ap); va_end(ap);
    fputc('\n', lg); fflush(lg);
    pthread_mutex_unlock(&mu);
}

// --- decoding ----------------------------------------------------------------
static const unsigned char key[4] = {0xe7, 0xf3, 0xe7, 0xff};
static void decode(const unsigned char *buf, unsigned char *out) {
    for (int y = 0; y < LINES; y++) {
        const unsigned char *src = buf + y * LINE_BYTES;
        unsigned char *dst = out + y * LINE_PIXELS * 2;
        int off = y * LINE_BYTES;
        for (int i = 0; i < LINE_PIXELS * 2; i++) dst[i] = src[i] ^ key[(off + i) & 3];
    }
}
// hash of the pixels only: the 128 padding bytes after each line change between frames
// of a static screen (two alternating buffers), so they are skipped
static uint32_t fnv(const unsigned char *d) {
    uint32_t h = 2166136261u;
    for (int y = 0; y < LINES; y++)
        for (int i = y * LINE_BYTES, e = i + LINE_PIXELS * 2; i < e; i++) { h ^= d[i]; h *= 16777619u; }
    return h;
}

// --- jit.net sink (same wire format as usbfake) ------------------------------
static int sock = -1; static double last_connect;
static void be32(unsigned char *p, uint32_t v) { p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v; }
static int net_connect(void) {
    if (sock >= 0) return 1;
    double t = now(); if (t - last_connect < 1.0) return 0; last_connect = t;
    const char *ps = getenv("USBTAP_PORT"); int port = ps ? atoi(ps) : 7474;
    int s = socket(AF_INET, SOCK_STREAM, 0); if (s < 0) return 0;
    struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_port = htons(port); a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (connect(s, (struct sockaddr *)&a, sizeof a) != 0) { close(s); return 0; }
    int one = 1; setsockopt(s, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
    setsockopt(s, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
    struct timeval tv = {0, 200000}; setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof tv);
    sock = s; tl("jit.net connected port %d", port); return 1;
}
static int send_all(const unsigned char *d, size_t n) {
    while (n) { ssize_t w = send(sock, d, n, 0); if (w <= 0) return 0; d += w; n -= w; } return 1;
}
static void net_send_frame(const unsigned char *bgr565) {
    static unsigned char pkt[8 + 288 + LINES * LINE_PIXELS * 4];
    if (!net_connect()) return;
    unsigned char *h = pkt; memcpy(h, "JMTX", 4); h[4] = 0x20; h[5] = 0x01; h[6] = 0; h[7] = 0;
    unsigned char *m = pkt + 8; memset(m, 0, 288); memcpy(m, "XTMJ", 4);
    be32(m + 4, 288); be32(m + 8, 4); be32(m + 12, 0); be32(m + 16, 2);
    be32(m + 20, LINE_PIXELS); be32(m + 24, LINES); for (int i = 2; i < 32; i++) be32(m + 20 + 4 * i, 1);
    be32(m + 148, 4); be32(m + 152, LINE_PIXELS * 4);
    be32(m + 276, LINES * LINE_PIXELS * 4);
    double t = now() * 1000.0; unsigned char *tb = (unsigned char *)&t; for (int i = 0; i < 8; i++) m[280 + i] = tb[7 - i];
    unsigned char *d = pkt + 8 + 288;
    for (int i = 0; i < LINES * LINE_PIXELS; i++) {
        unsigned p = bgr565[2 * i] | (bgr565[2 * i + 1] << 8);
        d[4 * i] = 255; d[4 * i + 1] = (p & 0x1f) << 3; d[4 * i + 2] = ((p >> 5) & 0x3f) << 2; d[4 * i + 3] = ((p >> 11) & 0x1f) << 3;
    }
    if (!send_all(pkt, sizeof pkt)) { tl("jit.net send failed (%s), will reconnect", strerror(errno)); close(sock); sock = -1; }
}

// --- worker: the helper's USB thread only copies the raw frame -----------------
static unsigned char slot[FRAME_BYTES]; static int slot_full;
static pthread_cond_t cv = PTHREAD_COND_INITIALIZER;
static pthread_mutex_t slot_mu = PTHREAD_MUTEX_INITIALIZER;
static void *worker(void *arg) {
    (void)arg;
    static unsigned char raw[FRAME_BYTES], out[OUT_BYTES];
    const char *fs = getenv("USBTAP_FPS"); double period = 1.0 / (fs ? atof(fs) : 30.0);
    char tmp[1100], fin[1100];
    snprintf(tmp, sizeof tmp, "%s/frame.tmp", dir); snprintf(fin, sizeof fin, "%s/frame.bin", dir);
    for (;;) {
        pthread_mutex_lock(&slot_mu);
        while (!slot_full) pthread_cond_wait(&cv, &slot_mu);
        memcpy(raw, slot, FRAME_BYTES); slot_full = 0;
        pthread_mutex_unlock(&slot_mu);
        double t0 = now();
        decode(raw, out);
        FILE *f = fopen(tmp, "wb"); if (f) { fwrite(out, 1, sizeof out, f); fclose(f); rename(tmp, fin); }
        net_send_frame(out);
        double left = period - (now() - t0); if (left > 0) usleep((useconds_t)(left * 1e6));
    }
    return 0;
}

// --- recording (unthrottled hash log, optional full frames) --------------------
static int rec_on, rec_full; static double rec_checked;
static FILE *rlog, *rbin;
static void rec_poll(void) {
    double t = now(); if (t - rec_checked < 0.5) return; rec_checked = t;
    char p[1100]; struct stat st;
    snprintf(p, sizeof p, "%s/rec.on", dir); int on = stat(p, &st) == 0;
    snprintf(p, sizeof p, "%s/rec.full", dir); rec_full = on && stat(p, &st) == 0;
    if (on && !rlog) { snprintf(p, sizeof p, "%s/rec.log", dir); rlog = fopen(p, "a"); }
    if (rec_full && !rbin) { snprintf(p, sizeof p, "%s/rec.bin", dir); rbin = fopen(p, "ab"); }
    if (!on && rlog) { fclose(rlog); rlog = 0; }
    if (!rec_full && rbin) { fclose(rbin); rbin = 0; }
    rec_on = on;
}
static void rec_frame(const unsigned char *buf) {
    static uint32_t last; static unsigned char out[OUT_BYTES];
    double t = now(); uint32_t h = fnv(buf);
    if (rlog) { fprintf(rlog, "%.6f %08x\n", t, h); fflush(rlog); }
    if (rbin && h != last) { decode(buf, out); fwrite(&t, 8, 1, rbin); fwrite(out, 1, OUT_BYTES, rbin); fflush(rbin); }
    last = h;
}

static unsigned long frames;
static int expect_frame;
static void tap_out(const unsigned char *d, int len) {
    if (len == 16 && d[0] == 0xff && d[1] == 0xcc && d[2] == 0xaa && d[3] == 0x88) { expect_frame = 1; return; }
    if (len != FRAME_BYTES || !expect_frame) return;
    expect_frame = 0;
    if (pthread_mutex_trylock(&slot_mu) == 0) {     // never block the helper; drop if the worker is busy
        memcpy(slot, d, FRAME_BYTES); slot_full = 1; pthread_cond_signal(&cv);
        pthread_mutex_unlock(&slot_mu);
    }
    rec_poll(); if (rec_on) rec_frame(d);
    frames++; if (frames == 1 || frames % 500 == 0) tl("frames=%lu", frames);
}

// --- real library ----------------------------------------------------------
static void *real;
static void *sym(const char *n) { void *p = dlsym(real, n); if (!p) tl("MISSING %s", n); return p; }

__attribute__((constructor)) static void setup(void) {
    const char *d = getenv("USBTAP_DIR");
    if (d) strlcpy(dir, d, sizeof dir);
    else { const char *t = getenv("TMPDIR"); snprintf(dir, sizeof dir, "%s/push-tap", t ? t : "/tmp"); }
    mkdir(dir, 0755);
    char p[1100];
    snprintf(p, sizeof p, "%s/usbtap.log", dir); lg = fopen(p, "a");
    Dl_info info; dladdr((void *)setup, &info);
    strlcpy(p, info.dli_fname, sizeof p);
    char *slash = strrchr(p, '/'); if (slash) slash[1] = 0;
    strlcat(p, "libusb-1.0.real.dylib", sizeof p);
    real = dlopen(p, RTLD_NOW | RTLD_LOCAL);
    tl("usbtap loaded pid=%d real=%s -> %p dir=%s", getpid(), p, real, dir);
    pthread_t th; pthread_create(&th, 0, worker, 0); pthread_detach(th);
}

// --- forwarded API ---------------------------------------------------------
#define FWD(ret, name, args, call) \
    static ret (*r_##name) args; \
    ret name args { if (!r_##name) r_##name = sym(#name); return r_##name call; }

FWD(int, libusb_init, (libusb_context **c), (c))
FWD(void, libusb_exit, (libusb_context *c), (c))
FWD(int, libusb_set_option, (libusb_context *c, int o, ...), (c, o))
FWD(const char *, libusb_error_name, (int e), (e))
FWD(const char *, libusb_strerror, (int e), (e))
FWD(long, libusb_get_device_list, (libusb_context *c, libusb_device ***l), (c, l))
FWD(void, libusb_free_device_list, (libusb_device **l, int u), (l, u))
FWD(int, libusb_get_device_descriptor, (libusb_device *d, struct libusb_device_descriptor *desc), (d, desc))
FWD(void, libusb_close, (libusb_device_handle *h), (h))
FWD(int, libusb_release_interface, (libusb_device_handle *h, int i), (h, i))
FWD(int, libusb_handle_events_timeout, (libusb_context *c, struct timeval *tv), (c, tv))
FWD(int, libusb_hotplug_register_callback, (libusb_context *c, int ev, int fl, int vid, int pid, int cls, void *cb, void *ud, int *handle), (c, ev, fl, vid, pid, cls, cb, ud, handle))
FWD(int, libusb_hotplug_deregister_callback, (libusb_context *c, int h), (c, h))
FWD(struct libusb_transfer *, libusb_alloc_transfer, (int n), (n))
FWD(void, libusb_free_transfer, (struct libusb_transfer *t), (t))
FWD(int, libusb_cancel_transfer, (struct libusb_transfer *t), (t))

static int (*r_libusb_open)(libusb_device *, libusb_device_handle **);
int libusb_open(libusb_device *d, libusb_device_handle **h) {
    if (!r_libusb_open) r_libusb_open = sym("libusb_open");
    int rc = r_libusb_open(d, h); tl("open -> %d", rc); return rc;
}
static int (*r_libusb_claim_interface)(libusb_device_handle *, int);
int libusb_claim_interface(libusb_device_handle *h, int i) {
    if (!r_libusb_claim_interface) r_libusb_claim_interface = sym("libusb_claim_interface");
    int rc = r_libusb_claim_interface(h, i); tl("claim_interface %d -> %d", i, rc); return rc;
}
static int (*r_libusb_bulk_transfer)(libusb_device_handle *, unsigned char, unsigned char *, int, int *, unsigned int);
int libusb_bulk_transfer(libusb_device_handle *h, unsigned char ep, unsigned char *data, int len, int *actual, unsigned int timeout) {
    if (!r_libusb_bulk_transfer) r_libusb_bulk_transfer = sym("libusb_bulk_transfer");
    if (!(ep & 0x80)) tap_out(data, len);
    return r_libusb_bulk_transfer(h, ep, data, len, actual, timeout);
}
static int (*r_libusb_submit_transfer)(struct libusb_transfer *);
int libusb_submit_transfer(struct libusb_transfer *t) {
    if (!r_libusb_submit_transfer) r_libusb_submit_transfer = sym("libusb_submit_transfer");
    if (!(t->endpoint & 0x80)) tap_out(t->buffer, t->length);
    return r_libusb_submit_transfer(t);
}
