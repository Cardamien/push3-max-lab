// midispy: DYLD_INSERT_LIBRARIES shim that logs which CoreMIDI endpoints a process connects to or sends to.
// Build: clang -dynamiclib -framework CoreMIDI -framework CoreFoundation midispy.c -o midispy.dylib
// Also compiled into usbfake's libusb (see usbfake.c), where it logs only while $USBFAKE_DIR/midispy.on exists.
#include <CoreMIDI/CoreMIDI.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
// Log file: $MIDISPY_LOG, or $USBFAKE_DIR/midispy.log while $USBFAKE_DIR/midispy.on exists (the copy built
// into usbfake's libusb is switched on and off that way, without restarting the helper). NULL = off.
static const char *logpath(void) {
  static char buf[1024];
  const char *p = getenv("MIDISPY_LOG"); if (p) return p;
  const char *d = getenv("USBFAKE_DIR"); if (!d) return NULL;
  snprintf(buf, sizeof buf, "%s/midispy.on", d); if (access(buf, F_OK) != 0) return NULL;
  snprintf(buf, sizeof buf, "%s/midispy.log", d); return buf;
}
#define DYLD_INTERPOSE(_new, _old) \
  __attribute__((used)) static struct { const void *n; const void *o; } _interpose_##_old \
  __attribute__((section("__DATA,__interpose"))) = { (const void *)(unsigned long)&_new, (const void *)(unsigned long)&_old };

static void logep(const char *what, MIDIEndpointRef e) {
  CFStringRef n = NULL, m = NULL; char nb[256] = "?", mb[256] = "?";
  MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &n);
  MIDIObjectGetStringProperty(e, kMIDIPropertyModel, &m);
  if (n) { CFStringGetCString(n, nb, sizeof nb, kCFStringEncodingUTF8); CFRelease(n); }
  if (m) { CFStringGetCString(m, mb, sizeof mb, kCFStringEncodingUTF8); CFRelease(m); }
  const char *p = logpath(); FILE *f = p ? fopen(p, "a") : NULL;
  if (f) { fprintf(f, "%s endpoint %u display='%s' model='%s'\n", what, (unsigned)e, nb, mb); fclose(f); }
}
static OSStatus my_connect(MIDIPortRef port, MIDIEndpointRef src, void *ref) {
  logep("connect-source", src); return MIDIPortConnectSource(port, src, ref);
}
static int sent = 0;
static OSStatus my_midisend(MIDIPortRef port, MIDIEndpointRef dst, const MIDIPacketList *pl) {
  if (sent++ < 3) logep("send-to", dst); return MIDISend(port, dst, pl);
}
DYLD_INTERPOSE(my_connect, MIDIPortConnectSource)
DYLD_INTERPOSE(my_midisend, MIDISend)

// socket traffic with Live: log small writes to push-to-live and reads from live-to-push
#include <sys/socket.h>
#include <sys/un.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
static int peer_kind(int fd) { // 1 push-to-live (client side), 2 live-to-push (accepted side), 0 other
  struct sockaddr_un a; socklen_t l = sizeof a;
  memset(&a, 0, sizeof a);
  if (getpeername(fd, (struct sockaddr *)&a, &l) == 0 && a.sun_family == AF_UNIX && strstr(a.sun_path, "push-to-live")) return 1;
  l = sizeof a; memset(&a, 0, sizeof a);
  if (getsockname(fd, (struct sockaddr *)&a, &l) == 0 && a.sun_family == AF_UNIX && strstr(a.sun_path, "live-to-push")) return 2;
  return 0;
}
static void dump(const char *what, int fd, const void *b, ssize_t n) {
  if (n <= 0) return;
  if (n == 10 && ((const unsigned char *)b)[8] == 1 && ((const unsigned char *)b)[9] == 0xf8) return;   // skip MIDI clock
  const char *p = logpath(); FILE *f = p ? fopen(p, "a") : NULL; if (!f) return;
  struct timespec ts; clock_gettime(CLOCK_REALTIME, &ts);
  fprintf(f, "%ld.%03ld %s fd%d n=%zd:", ts.tv_sec, ts.tv_nsec / 1000000, what, fd, n);
  for (ssize_t i = 0; i < n && i < 48; i++) fprintf(f, " %02x", ((const unsigned char *)b)[i]);
  fprintf(f, "\n"); fclose(f);
}
static ssize_t my_write(int fd, const void *b, size_t n) {
  ssize_t r = write(fd, b, n); int k = peer_kind(fd); if (k) dump(k == 1 ? "to-live(write)" : "?w", fd, b, r); return r;
}
static ssize_t my_send(int fd, const void *b, size_t n, int fl) {
  ssize_t r = send(fd, b, n, fl); int k = peer_kind(fd); if (k) dump(k == 1 ? "to-live(send)" : "?s", fd, b, r); return r;
}
static ssize_t my_read(int fd, void *b, size_t n) {
  ssize_t r = read(fd, b, n); int k = peer_kind(fd); if (k) dump(k == 2 ? "from-live(read)" : "?r", fd, b, r); return r;
}
static ssize_t my_recv(int fd, void *b, size_t n, int fl) {
  ssize_t r = recv(fd, b, n, fl); int k = peer_kind(fd); if (k) dump(k == 2 ? "from-live(recv)" : "?v", fd, b, r); return r;
}
DYLD_INTERPOSE(my_write, write)
DYLD_INTERPOSE(my_send, send)
DYLD_INTERPOSE(my_read, read)
DYLD_INTERPOSE(my_recv, recv)
#include <sys/uio.h>
static void dumpiov(const char *what, int fd, const struct iovec *iov, int cnt, ssize_t n) {
  unsigned char buf[64]; size_t k = 0;
  for (int i = 0; i < cnt && k < sizeof buf && (ssize_t)k < n; i++) {
    size_t c = iov[i].iov_len; if (c > sizeof buf - k) c = sizeof buf - k; if ((ssize_t)(k + c) > n) c = n - k;
    memcpy(buf + k, iov[i].iov_base, c); k += c; }
  if (n > 0) { unsigned char tmp[64]; memcpy(tmp, buf, k); dump(what, fd, tmp, n < (ssize_t)k ? n : (ssize_t)k); }
}
static ssize_t my_sendmsg(int fd, const struct msghdr *m, int fl) {
  ssize_t r = sendmsg(fd, m, fl); int k = peer_kind(fd); if (k) dumpiov(k == 1 ? "to-live(sendmsg)" : "?sm", fd, m->msg_iov, m->msg_iovlen, r); return r;
}
static ssize_t my_recvmsg(int fd, struct msghdr *m, int fl) {
  ssize_t r = recvmsg(fd, m, fl); int k = peer_kind(fd); if (k) dumpiov(k == 2 ? "from-live(recvmsg)" : "?rm", fd, m->msg_iov, m->msg_iovlen, r); return r;
}
static ssize_t my_writev(int fd, const struct iovec *v, int c) {
  ssize_t r = writev(fd, v, c); int k = peer_kind(fd); if (k) dumpiov(k == 1 ? "to-live(writev)" : "?wv", fd, v, c, r); return r;
}
static ssize_t my_readv(int fd, const struct iovec *v, int c) {
  ssize_t r = readv(fd, v, c); int k = peer_kind(fd); if (k) dumpiov(k == 2 ? "from-live(readv)" : "?rv", fd, v, c, r); return r;
}
DYLD_INTERPOSE(my_sendmsg, sendmsg)
DYLD_INTERPOSE(my_recvmsg, recvmsg)
DYLD_INTERPOSE(my_writev, writev)
DYLD_INTERPOSE(my_readv, readv)
