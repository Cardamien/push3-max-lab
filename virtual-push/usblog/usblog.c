// usblog: a drop-in libusb-1.0.dylib that forwards every call the Push 3
// helper makes to the real library (renamed libusb-1.0.real.dylib beside it)
// and records the whole conversation.
//
// Text log  : $USBLOG_DIR/usb.log   (one line per call)
// Binary log: $USBLOG_DIR/usb.bin   (records: see struct rec below)
//
// Build: clang -arch arm64 -arch x86_64 -dynamiclib -O2 -o libusb-1.0.dylib \
//        -install_name @rpath/libusb-1.0.dylib usblog.c
#include <dlfcn.h>
#include <pthread.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <unistd.h>
#include <mach-o/dyld.h>

// --- minimal libusb types (ABI of libusb 1.0.2x) ---------------------------
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

// --- logging ---------------------------------------------------------------
static FILE *tlog, *blog;
static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static int full_per_ep[256];   // transfers still dumped in full, per endpoint
#define FULL_LIMIT 400
#define HEAD_BYTES 64

static double now(void) { struct timeval tv; gettimeofday(&tv, 0); return tv.tv_sec + tv.tv_usec / 1e6; }

static void tl(const char *fmt, ...) {
    if (!tlog) return;
    pthread_mutex_lock(&mu);
    fprintf(tlog, "%.6f ", now());
    va_list ap; va_start(ap, fmt); vfprintf(tlog, fmt, ap); va_end(ap);
    fputc('\n', tlog); fflush(tlog);
    pthread_mutex_unlock(&mu);
}

// binary record: magic 'USBR', kind, endpoint, status, length, stored, time, data[stored]
struct rec { char magic[4]; uint8_t kind, endpoint; int32_t status, length, stored; double t; };
enum { K_BULK_OUT = 1, K_BULK_IN, K_SUBMIT_OUT, K_SUBMIT_IN, K_DONE_OUT, K_DONE_IN };

static void bl(uint8_t kind, uint8_t ep, int status, const unsigned char *data, int len) {
    if (!blog) return;
    pthread_mutex_lock(&mu);
    int stored = len;
    if (full_per_ep[ep] < FULL_LIMIT) full_per_ep[ep]++; else if (stored > HEAD_BYTES) stored = HEAD_BYTES;
    if (stored < 0) stored = 0;
    struct rec r = {{'U','S','B','R'}, kind, ep, status, len, stored, now()};
    fwrite(&r, sizeof r, 1, blog);
    if (stored && data) fwrite(data, 1, stored, blog);
    fflush(blog);
    pthread_mutex_unlock(&mu);
}

static void hex(char *out, const unsigned char *d, int n) {
    for (int i = 0; i < n; i++) sprintf(out + 3 * i, "%02x ", d[i]);
    out[n ? 3 * n - 1 : 0] = 0;
}

// --- real library ----------------------------------------------------------
static void *real;
#define R(name) static __typeof__(name) *r_##name;
static void *sym(const char *n) { void *p = dlsym(real, n); if (!p) tl("MISSING %s", n); return p; }

__attribute__((constructor)) static void setup(void) {
    const char *dir = getenv("USBLOG_DIR"); if (!dir) dir = getenv("TMPDIR"); if (!dir) dir = "/tmp";
    char p[1024];
    snprintf(p, sizeof p, "%s/usb.log", dir); tlog = fopen(p, "a");
    snprintf(p, sizeof p, "%s/usb.bin", dir); blog = fopen(p, "ab");
    Dl_info info; dladdr((void *)setup, &info);
    strlcpy(p, info.dli_fname, sizeof p);
    char *slash = strrchr(p, '/'); if (slash) slash[1] = 0;
    strlcat(p, "libusb-1.0.real.dylib", sizeof p);
    real = dlopen(p, RTLD_NOW | RTLD_LOCAL);
    tl("usblog loaded pid=%d real=%s -> %p", getpid(), p, real);
}

// --- forwarded API ---------------------------------------------------------
#define FWD(ret, name, args, call) \
    static ret (*r_##name) args; \
    ret name args { if (!r_##name) r_##name = sym(#name); return r_##name call; }

FWD(int, libusb_init, (libusb_context **c), (c))
FWD(void, libusb_exit, (libusb_context *c), (c))
FWD(int, libusb_set_option, (libusb_context *c, int o, ...), (c, o))   // Push3 passes no extra arg for LOG_LEVEL? keep simple
FWD(const char *, libusb_error_name, (int e), (e))
FWD(const char *, libusb_strerror, (int e), (e))
FWD(long, libusb_get_device_list, (libusb_context *c, libusb_device ***l), (c, l))
FWD(void, libusb_free_device_list, (libusb_device **l, int u), (l, u))
FWD(int, libusb_handle_events_timeout, (libusb_context *c, struct timeval *tv), (c, tv))
FWD(int, libusb_hotplug_deregister_callback, (libusb_context *c, int h), (c, h))
FWD(struct libusb_transfer *, libusb_alloc_transfer, (int n), (n))
FWD(int, libusb_cancel_transfer, (struct libusb_transfer *t), (t))

static int (*r_libusb_get_device_descriptor)(libusb_device *, struct libusb_device_descriptor *);
int libusb_get_device_descriptor(libusb_device *d, struct libusb_device_descriptor *desc) {
    if (!r_libusb_get_device_descriptor) r_libusb_get_device_descriptor = sym("libusb_get_device_descriptor");
    int rc = r_libusb_get_device_descriptor(d, desc);
    if (rc == 0) tl("get_device_descriptor vid=%04x pid=%04x bcdDevice=%04x class=%d nconf=%d",
                    desc->idVendor, desc->idProduct, desc->bcdDevice, desc->bDeviceClass, desc->bNumConfigurations);
    return rc;
}

static int (*r_libusb_open)(libusb_device *, libusb_device_handle **);
int libusb_open(libusb_device *d, libusb_device_handle **h) {
    if (!r_libusb_open) r_libusb_open = sym("libusb_open");
    int rc = r_libusb_open(d, h);
    tl("open dev=%p -> rc=%d handle=%p", d, rc, rc == 0 ? *h : 0);
    return rc;
}
static void (*r_libusb_close)(libusb_device_handle *);
void libusb_close(libusb_device_handle *h) {
    if (!r_libusb_close) r_libusb_close = sym("libusb_close");
    tl("close handle=%p", h); r_libusb_close(h);
}
static int (*r_libusb_claim_interface)(libusb_device_handle *, int);
int libusb_claim_interface(libusb_device_handle *h, int i) {
    if (!r_libusb_claim_interface) r_libusb_claim_interface = sym("libusb_claim_interface");
    int rc = r_libusb_claim_interface(h, i); tl("claim_interface %d -> %d", i, rc); return rc;
}
static int (*r_libusb_release_interface)(libusb_device_handle *, int);
int libusb_release_interface(libusb_device_handle *h, int i) {
    if (!r_libusb_release_interface) r_libusb_release_interface = sym("libusb_release_interface");
    int rc = r_libusb_release_interface(h, i); tl("release_interface %d -> %d", i, rc); return rc;
}
static int (*r_libusb_hotplug_register_callback)(libusb_context *, int, int, int, int, int, void *, void *, int *);
int libusb_hotplug_register_callback(libusb_context *c, int ev, int fl, int vid, int pid, int cls, void *cb, void *ud, int *handle) {
    if (!r_libusb_hotplug_register_callback) r_libusb_hotplug_register_callback = sym("libusb_hotplug_register_callback");
    int rc = r_libusb_hotplug_register_callback(c, ev, fl, vid, pid, cls, cb, ud, handle);
    tl("hotplug_register events=%d flags=%d vid=%04x pid=%04x class=%d -> %d", ev, fl, vid, pid, cls, rc);
    return rc;
}

static int (*r_libusb_bulk_transfer)(libusb_device_handle *, unsigned char, unsigned char *, int, int *, unsigned int);
int libusb_bulk_transfer(libusb_device_handle *h, unsigned char ep, unsigned char *data, int len, int *actual, unsigned int timeout) {
    if (!r_libusb_bulk_transfer) r_libusb_bulk_transfer = sym("libusb_bulk_transfer");
    char hx[3 * 32 + 1];
    int in = ep & 0x80;
    if (!in) { hex(hx, data, len < 32 ? len : 32); tl("bulk OUT ep=%02x len=%d timeout=%u data=%s", ep, len, timeout, hx); }
    int rc = r_libusb_bulk_transfer(h, ep, data, len, actual, timeout);
    int act = actual ? *actual : -1;
    if (in) { hex(hx, data, act > 0 ? (act < 32 ? act : 32) : 0); tl("bulk IN ep=%02x len=%d -> rc=%d actual=%d data=%s", ep, len, rc, act, hx); }
    else tl("bulk OUT ep=%02x -> rc=%d actual=%d", ep, rc, act);
    bl(in ? K_BULK_IN : K_BULK_OUT, ep, rc, data, in ? act : len);
    return rc;
}

// async: remember the original callback per transfer
#define MAXT 4096
static struct { struct libusb_transfer *t; libusb_transfer_cb_fn cb; } table[MAXT];
static libusb_transfer_cb_fn take(struct libusb_transfer *t) {
    pthread_mutex_lock(&mu);
    libusb_transfer_cb_fn cb = 0;
    for (int i = 0; i < MAXT; i++) if (table[i].t == t) { cb = table[i].cb; table[i].t = 0; break; }
    pthread_mutex_unlock(&mu); return cb;
}
static void put(struct libusb_transfer *t, libusb_transfer_cb_fn cb) {
    pthread_mutex_lock(&mu);
    for (int i = 0; i < MAXT; i++) if (!table[i].t) { table[i].t = t; table[i].cb = cb; break; }
    pthread_mutex_unlock(&mu);
}
static void done_cb(struct libusb_transfer *t) {
    libusb_transfer_cb_fn cb = take(t);
    int in = t->endpoint & 0x80;
    char hx[3 * 32 + 1]; hex(hx, t->buffer, t->actual_length < 32 ? (t->actual_length > 0 ? t->actual_length : 0) : 32);
    tl("done %s ep=%02x type=%d status=%d length=%d actual=%d data=%s", in ? "IN" : "OUT", t->endpoint, t->type, t->status, t->length, t->actual_length, hx);
    bl(in ? K_DONE_IN : K_DONE_OUT, t->endpoint, t->status, t->buffer, in ? t->actual_length : 0);
    t->callback = cb;
    if (cb) cb(t);
}
static int (*r_libusb_submit_transfer)(struct libusb_transfer *);
int libusb_submit_transfer(struct libusb_transfer *t) {
    if (!r_libusb_submit_transfer) r_libusb_submit_transfer = sym("libusb_submit_transfer");
    int in = t->endpoint & 0x80;
    char hx[3 * 32 + 1]; hex(hx, t->buffer, t->length < 32 ? t->length : 32);
    tl("submit %s ep=%02x type=%d flags=%d timeout=%u length=%d data=%s", in ? "IN" : "OUT", t->endpoint, t->type, t->flags, t->timeout, t->length, in ? "" : hx);
    bl(in ? K_SUBMIT_IN : K_SUBMIT_OUT, t->endpoint, 0, t->buffer, in ? 0 : t->length);
    put(t, t->callback);
    t->callback = done_cb;
    int rc = r_libusb_submit_transfer(t);
    if (rc != 0) { t->callback = take(t); tl("submit -> rc=%d", rc); }
    return rc;
}
static void (*r_libusb_free_transfer)(struct libusb_transfer *);
void libusb_free_transfer(struct libusb_transfer *t) {
    if (!r_libusb_free_transfer) r_libusb_free_transfer = sym("libusb_free_transfer");
    if (t) take(t);
    r_libusb_free_transfer(t);
}
