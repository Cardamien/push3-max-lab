// usbfake: a stand-in libusb-1.0.dylib that pretends to be a Push 3 display.
// The Push 3 helper sees one device (vid 2982 pid 1969), its startup queries
// get the replies recorded from a real Push 3 (firmware 1.5.4, 2026-10-30),
// and every screen frame it sends is decoded and handed to the sink below.
//
// Sink: every decoded frame is also sent over TCP to a [jit.net.recv] in Max
// (host 127.0.0.1, port $USBFAKE_PORT, default 7474) as a 4-plane char ARGB
// 960x160 matrix in jit.net.send's wire format (captured from Max 9, 2026-10-30:
// 8-byte packet header 'JMTX' + little-endian size, then a 288-byte matrix
// header 'XTMJ' with big-endian fields, then the data). Frames are dropped
// while no receiver is listening. Besides that, the latest decoded frame, 960x160 pixels, 16-bit BGR565
// little-endian, line stride 1920 bytes, is written to $USBFAKE_DIR/frame.bin
// (written to frame.tmp then renamed, so readers never see a torn frame);
// $USBFAKE_DIR/usbfake.log gets one line per command and a frame count.
//
// Build: clang -arch arm64 -arch x86_64 -dynamiclib -O2 -o libusb-1.0.dylib \
//        -install_name @rpath/libusb-1.0.dylib -framework CoreMIDI -framework CoreFoundation usbfake.c ../midispy/midispy.c
// (midispy logs the helper's MIDI ports and its traffic with Live while $USBFAKE_DIR/midispy.on exists)
#include <pthread.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <signal.h>

typedef struct libusb_context libusb_context;
typedef struct libusb_device libusb_device;
typedef struct libusb_device_handle libusb_device_handle;
struct libusb_device_descriptor {
    uint8_t bLength, bDescriptorType; uint16_t bcdUSB;
    uint8_t bDeviceClass, bDeviceSubClass, bDeviceProtocol, bMaxPacketSize0;
    uint16_t idVendor, idProduct, bcdDevice;
    uint8_t iManufacturer, iProduct, iSerialNumber, bNumConfigurations;
};
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
enum { LIBUSB_SUCCESS = 0, LIBUSB_ERROR_TIMEOUT = -7, LIBUSB_ERROR_NO_DEVICE = -4 };
enum { TRANSFER_COMPLETED = 0, TRANSFER_TIMED_OUT = 2, TRANSFER_CANCELLED = 3 };

#define FRAME_BYTES 327680
#define LINE_BYTES 2048
#define LINE_PIXELS 960
#define LINES 160

static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static FILE *lg;
static char dir[1024];
static int fake_device, fake_handle;              // addresses used as opaque pointers
static unsigned long frames;
static int sock = -1; static double last_connect;
static double now(void);
static void tl(const char *fmt, ...);

static void be32(unsigned char *p, uint32_t v) { p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v; }
static int net_connect(void) {
    if (sock >= 0) return 1;
    double t = now(); if (t - last_connect < 1.0) return 0; last_connect = t;
    const char *ps = getenv("USBFAKE_PORT"); int port = ps ? atoi(ps) : 7474;
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
// ARGB char matrix 960x160 in jit.net.send format
static void net_send_frame(const unsigned char *bgr565) {
    static unsigned char pkt[8 + 288 + LINES * LINE_PIXELS * 4];
    if (!net_connect()) return;
    unsigned char *h = pkt; memcpy(h, "JMTX", 4); h[4] = 0x20; h[5] = 0x01; h[6] = 0; h[7] = 0;   // size 288, little-endian
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

static double now(void) { struct timeval tv; gettimeofday(&tv, 0); return tv.tv_sec + tv.tv_usec / 1e6; }
static void tl(const char *fmt, ...) {
    if (!lg) return;
    pthread_mutex_lock(&mu);
    fprintf(lg, "%.6f ", now());
    va_list ap; va_start(ap, fmt); vfprintf(lg, fmt, ap); va_end(ap);
    fputc('\n', lg); fflush(lg);
    pthread_mutex_unlock(&mu);
}

__attribute__((constructor)) static void setup(void) {
    const char *d = getenv("USBFAKE_DIR"); if (!d) d = getenv("TMPDIR"); if (!d) d = "/tmp";
    strlcpy(dir, d, sizeof dir);
    char p[1100]; snprintf(p, sizeof p, "%s/usbfake.log", dir); lg = fopen(p, "a");
    tl("usbfake loaded pid=%d", getpid());
}

// --- recorded replies (40 bytes each) ---------------------------------------
static const unsigned char reply_sysinfo[40] = {
    0xfe,0x00,0xf0,0xff,0x01,0x06,0x00,0x00,0x5b,0x00,0x00,0x01,0x03,0x01,0x01,0x00,
    0x01,0x00,0x00,0x00, 0x3c,0x00,0x00,0x00, 0x04,0x00,0x05,0x01,0,0,0,0, 0,0,0,0,0,0,0,0 };
    // serial at 16..19 (dummy 1), uptime in seconds at 20..23 (dummy 60), package version 1.5.4 at 24..27
static const unsigned char reply_fw_head[29] = {
    0xff,0x00,0xf0,0xff,0xe0,0x0a,0x00,0x00,0x18,0x82,0x02,0x00,0x45,0x00,0x00,0x00,
    0x00,0x00,0x03,0x00,0x90,0xac,0x02,0x00,0x86,0x75,0x4e,0x4f,0x00 };
struct fw { unsigned char sub; unsigned char tail[11]; };
static const struct fw fw_tail[] = {
    { 0x06, {0x75,0x00,0x00,0x01,0x14,0xa6,0x19,0x73,0xb1,0x69,0x6c} },   // pmc 1.20
    { 0x08, {0x35,0x00,0x00,0x01,0x09,0x5e,0xc6,0xe4,0xeb,0x73,0x2e} },   // apc 1.9
    { 0x07, {0x55,0x00,0x00,0x0d,0x00,0x00,0x00,0xcd,0x57,0xe1,0x16} },   // xySensor 0.13
    { 0x00, {0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00} },   // startupImage 0.0
    { 0x09, {0x97,0x01,0x00,0x00,0x00,0x07,0x00,0xed,0xd1,0xdd,0xe4} },   // imagery 0.7
};

// reply queue (the helper writes one command, then reads one reply)
static unsigned char replies[16][40]; static int rhead, rtail;
static void push_reply(const unsigned char *r) {
    pthread_mutex_lock(&mu); memcpy(replies[rtail % 16], r, 40); rtail++; pthread_mutex_unlock(&mu);
}
static int pop_reply(unsigned char *out) {
    pthread_mutex_lock(&mu);
    int ok = rhead < rtail; if (ok) { memcpy(out, replies[rhead % 16], 40); rhead++; }
    pthread_mutex_unlock(&mu); return ok;
}

// --- frame sink --------------------------------------------------------------
static const unsigned char key[4] = {0xe7, 0xf3, 0xe7, 0xff};
static void sink_frame(const unsigned char *buf) {
    static unsigned char out[LINES * LINE_PIXELS * 2];
    for (int y = 0; y < LINES; y++) {
        const unsigned char *src = buf + y * LINE_BYTES;
        unsigned char *dst = out + y * LINE_PIXELS * 2;
        int off = y * LINE_BYTES;
        for (int i = 0; i < LINE_PIXELS * 2; i++) dst[i] = src[i] ^ key[(off + i) & 3];
    }
    char tmp[1100], fin[1100];
    snprintf(tmp, sizeof tmp, "%s/frame.tmp", dir); snprintf(fin, sizeof fin, "%s/frame.bin", dir);
    FILE *f = fopen(tmp, "wb"); if (!f) return;
    fwrite(out, 1, sizeof out, f); fclose(f); rename(tmp, fin);
    net_send_frame(out);
    frames++;
    if (frames == 1 || frames % 500 == 0) tl("frames=%lu", frames);
    usleep(20000);   // a real Push takes ~20 ms per frame over USB; keep the helper's pace

}

// --- OUT handling ---------------------------------------------------------------
static int expect_frame;
static void handle_out(const unsigned char *d, int len) {
    if (len == 16 && d[0] == 0xff && d[1] == 0xcc && d[2] == 0xaa && d[3] == 0x88) { expect_frame = 1; return; }
    if (len == FRAME_BYTES && expect_frame) { expect_frame = 0; sink_frame(d); return; }
    if (len == 16 && d[0] == 0xf8 && d[1] == 0xf8 && d[2] == 0x13 && d[3] == 0x13) {
        unsigned char cmd = d[4], sub = d[8];
        tl("command %02x sub %02x", cmd, sub);
        if (cmd == 0x0a) { push_reply(reply_sysinfo); return; }
        if (cmd == 0x01) {
            unsigned char r[40]; memcpy(r, reply_fw_head, 29); memset(r + 29, 0, 11);
            for (unsigned i = 0; i < sizeof fw_tail / sizeof *fw_tail; i++)
                if (fw_tail[i].sub == sub) memcpy(r + 29, fw_tail[i].tail, 11);
            push_reply(r); return;
        }
        unsigned char zero[40] = {0}; push_reply(zero);
        tl("UNKNOWN command, replied zeros"); return;
    }
    char hx[3 * 16 + 1] = ""; for (int i = 0; i < len && i < 16; i++) sprintf(hx + 3 * i, "%02x ", d[i]);
    tl("unexpected OUT len=%d %s", len, hx);
}

// --- libusb API -------------------------------------------------------------------
int libusb_init(libusb_context **c) { if (c) *c = (libusb_context *)&fake_device; tl("init"); return 0; }
void libusb_exit(libusb_context *c) { (void)c; tl("exit"); }
int libusb_set_option(libusb_context *c, int o, ...) { (void)c; (void)o; return 0; }
const char *libusb_error_name(int e) { static char b[32]; snprintf(b, sizeof b, "FAKE_ERR_%d", e); return b; }
const char *libusb_strerror(int e) { return libusb_error_name(e); }
long libusb_get_device_list(libusb_context *c, libusb_device ***l) {
    (void)c; libusb_device **a = calloc(2, sizeof *a); a[0] = (libusb_device *)&fake_device; *l = a; return 1;
}
void libusb_free_device_list(libusb_device **l, int u) { (void)u; free(l); }
int libusb_get_device_descriptor(libusb_device *d, struct libusb_device_descriptor *desc) {
    (void)d; memset(desc, 0, sizeof *desc);
    desc->bLength = 18; desc->bDescriptorType = 1; desc->bcdUSB = 0x0200; desc->bDeviceClass = 239;
    desc->bDeviceSubClass = 2; desc->bDeviceProtocol = 1; desc->bMaxPacketSize0 = 64;
    desc->idVendor = 0x2982; desc->idProduct = 0x1969; desc->bcdDevice = 0x0100;
    desc->iManufacturer = 1; desc->iProduct = 2; desc->iSerialNumber = 3; desc->bNumConfigurations = 1;
    return 0;
}
int libusb_open(libusb_device *d, libusb_device_handle **h) { (void)d; *h = (libusb_device_handle *)&fake_handle; tl("open"); return 0; }
void libusb_close(libusb_device_handle *h) { (void)h; tl("close"); }
int libusb_claim_interface(libusb_device_handle *h, int i) { (void)h; tl("claim %d", i); return 0; }
int libusb_release_interface(libusb_device_handle *h, int i) { (void)h; tl("release %d", i); return 0; }
int libusb_hotplug_register_callback(libusb_context *c, int ev, int fl, int vid, int pid, int cls, void *cb, void *ud, int *handle) {
    (void)c; (void)fl; (void)cls; (void)cb; (void)ud; tl("hotplug_register ev=%d vid=%04x pid=%04x", ev, vid, pid);
    if (handle) *handle = 1; return 0;
}
int libusb_hotplug_deregister_callback(libusb_context *c, int h) { (void)c; (void)h; return 0; }

int libusb_bulk_transfer(libusb_device_handle *h, unsigned char ep, unsigned char *data, int len, int *actual, unsigned int timeout) {
    (void)h; (void)timeout;
    if (ep & 0x80) {
        if (len >= 40 && pop_reply(data)) { if (actual) *actual = 40; return 0; }
        if (actual) *actual = 0; tl("bulk IN with no reply queued"); return LIBUSB_ERROR_TIMEOUT;
    }
    handle_out(data, len); if (actual) *actual = len; return 0;
}

// async: completions are delivered from libusb_handle_events_timeout, like the real thing
static struct libusb_transfer *pending[64]; static int np;
static void complete_later(struct libusb_transfer *t) {
    pthread_mutex_lock(&mu); if (np < 64) pending[np++] = t; pthread_mutex_unlock(&mu);
}
struct libusb_transfer *libusb_alloc_transfer(int n) {
    return calloc(1, sizeof(struct libusb_transfer) + n * sizeof(struct libusb_iso_packet_descriptor));
}
void libusb_free_transfer(struct libusb_transfer *t) { free(t); }
int libusb_submit_transfer(struct libusb_transfer *t) {
    if (t->endpoint & 0x80) {
        if (t->length >= 40 && pop_reply(t->buffer)) { t->actual_length = 40; t->status = TRANSFER_COMPLETED; }
        else { t->actual_length = 0; t->status = TRANSFER_TIMED_OUT; tl("async IN with no reply queued"); }
    } else { handle_out(t->buffer, t->length); t->actual_length = t->length; t->status = TRANSFER_COMPLETED; }
    complete_later(t); return 0;
}
int libusb_cancel_transfer(struct libusb_transfer *t) { t->status = TRANSFER_CANCELLED; t->actual_length = 0; complete_later(t); return 0; }
int libusb_handle_events_timeout(libusb_context *c, struct timeval *tv) {
    (void)c; (void)tv;
    struct libusb_transfer *batch[64]; int n;
    pthread_mutex_lock(&mu); n = np; memcpy(batch, pending, n * sizeof *batch); np = 0; pthread_mutex_unlock(&mu);
    for (int i = 0; i < n; i++) if (batch[i]->callback) batch[i]->callback(batch[i]);
    if (!n) usleep(1000);
    return 0;
}
