// pushscreen: probe B3, our own program drawing on the real Push 3 screen over USB.
// Claims interface 0 only (the vendor display interface, no macOS driver), never a
// configuration-wide detach, never interface 6. Frame format from Live's helper
// (see virtual-push/README.md at the repository root): 16-byte header ff cc aa 88 + zeros, then
// 160 lines x 2048 bytes (960 BGR565 little-endian pixels + 128 padding), XOR e7 f3 e7 ff.
//
//   pushscreen [--info] [--fps N] [--secs S] [--stop black|none]
//     --info   send the helper's read-only system-info query (f8 f8 13 13 0a) first
//              and print the 40-byte reply
//     --fps    frame rate (default 30, at most 60)
//     --secs   how long to draw (default 5)
//     --stop   last frame: black (default) or none (leave the screen to time out)
// Picture: eight grey-to-colour bars and a white column sweeping left to right.
#include <libusb-1.0/libusb.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

enum { VID = 0x2982, PID = 0x1969, IFACE = 0, EP_OUT = 0x01, EP_IN = 0x81 };
enum { W = 960, H = 160, LINE = 2048, FRAME = H * LINE };
static const uint8_t key[4] = {0xe7, 0xf3, 0xe7, 0xff};
static uint8_t frame[FRAME];

static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec * 1e-9; }
static uint16_t bgr565(int r, int g, int b) { return (uint16_t)(((b >> 3) << 11) | ((g >> 2) << 5) | (r >> 3)); }

static void draw(int t, int black) {
    memset(frame, 0, sizeof frame);
    for (int y = 0; y < H; y++) {
        uint8_t *line = frame + y * LINE;
        for (int x = 0; x < W && !black; x++) {
            int bar = x / (W / 8), lvl = y * 255 / (H - 1);
            int r = (bar & 1) ? lvl : lvl / 4, g = (bar & 2) ? lvl : lvl / 4, b = (bar & 4) ? lvl : lvl / 4;
            if (abs(x - (t * 8) % W) < 3) r = g = b = 255;
            uint16_t p = bgr565(r, g, b);
            line[2 * x] = (uint8_t)p; line[2 * x + 1] = (uint8_t)(p >> 8);
        }
    }
    for (int i = 0; i < FRAME; i++) frame[i] ^= key[i & 3];
}

static int send_frame(libusb_device_handle *h) {
    uint8_t head[16] = {0xff, 0xcc, 0xaa, 0x88};
    int n = 0, rc = libusb_bulk_transfer(h, EP_OUT, head, sizeof head, &n, 1000);
    if (rc == 0) rc = libusb_bulk_transfer(h, EP_OUT, frame, FRAME, &n, 1000);
    return rc;
}

int main(int argc, char **argv) {
    int info = 0, fps = 30; double secs = 5; int stop_black = 1;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--info")) info = 1;
        else if (!strcmp(argv[i], "--fps") && i + 1 < argc) fps = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--secs") && i + 1 < argc) secs = atof(argv[++i]);
        else if (!strcmp(argv[i], "--stop") && i + 1 < argc) stop_black = strcmp(argv[++i], "none") != 0;
        else { fprintf(stderr, "usage: pushscreen [--info] [--fps N] [--secs S] [--stop black|none]\n"); return 2; }
    }
    if (fps < 1 || fps > 60) { fprintf(stderr, "fps must be 1..60\n"); return 2; }

    libusb_context *ctx; libusb_init(&ctx);
    libusb_device_handle *h = libusb_open_device_with_vid_pid(ctx, VID, PID);
    if (!h) { printf("open: no Push 3 (%04x:%04x) or access refused\n", VID, PID); return 1; }
    int rc = libusb_claim_interface(h, IFACE);
    printf("claim interface %d: %s\n", IFACE, rc ? libusb_error_name(rc) : "ok");
    if (rc) { libusb_close(h); libusb_exit(ctx); return 1; }

    if (info) {
        uint8_t q[16] = {0xf8, 0xf8, 0x13, 0x13, 0x0a}, r[64]; int n = 0;
        rc = libusb_bulk_transfer(h, EP_OUT, q, sizeof q, &n, 1000);
        printf("system-info query: %s\n", rc ? libusb_error_name(rc) : "sent");
        if (!rc) {
            rc = libusb_bulk_transfer(h, EP_IN, r, sizeof r, &n, 1000);
            printf("reply (%s, %d bytes):", rc ? libusb_error_name(rc) : "ok", n);
            for (int i = 0; i < n; i++) printf(" %02x", r[i]);
            printf("\n");
        }
    }

    int frames = 0, errors = 0; double t0 = now(), next = t0;
    while (now() - t0 < secs) {
        draw(frames, 0);
        if ((rc = send_frame(h))) { if (errors++ < 5) printf("frame %d: %s\n", frames, libusb_error_name(rc)); }
        frames++;
        next += 1.0 / fps; double wait = next - now(); if (wait > 0) usleep((useconds_t)(wait * 1e6));
    }
    double took = now() - t0;
    if (stop_black) { draw(0, 1); rc = send_frame(h); printf("black frame: %s\n", rc ? libusb_error_name(rc) : "ok"); }
    printf("frames %d in %.2f s (%.1f fps), errors %d\n", frames, took, frames / took, errors);
    libusb_release_interface(h, IFACE); libusb_close(h); libusb_exit(ctx);
    return 0;
}
