/* C-BORDER/1 : validateur local de trames pour trois coeurs GThink.
   Ne transmet rien et n'autorise aucune action distante.
   cc -std=c11 -Wall -Wextra -pedantic -o c_border c_border.c
*/
#include <stdio.h>
#include <string.h>

static int core(const char *s) {
    return !strcmp(s, "GTHINK_PUBLIC") ||
           !strcmp(s, "GTHINK_PRIVATE") ||
           !strcmp(s, "GTHINK_IMAGE");
}
static int kind(const char *s) {
    return !strcmp(s, "HELLO") || !strcmp(s, "CAPABILITY") ||
           !strcmp(s, "EVIDENCE_REF") || !strcmp(s, "ACK") || !strcmp(s, "STOP");
}
static int check(char *buf) {
    char *f[6];
    size_t i, n = strlen(buf);
    int k = 1;
    if (n && buf[n-1] == '\n') buf[--n] = 0;
    if (n && buf[n-1] == '\r') buf[--n] = 0;
    if (n == 0 || n > 150) return 0;
    for (i=0;i<n;++i) if ((unsigned char)buf[i] < 33 || (unsigned char)buf[i] > 126) return 0;
    f[0] = buf;
    for (i=0;i<n;++i) {
        if (buf[i] == '|') {
            if (k >= 6) return 0;
            buf[i] = 0;
            f[k++] = buf + i + 1;
        }
    }
    if (k != 6 || strcmp(f[0], "C-BORDER/1") || !core(f[1]) ||
        !core(f[2]) || !strcmp(f[1], f[2]) || !kind(f[3]) ||
        strlen(f[4]) != 16) return 0;
    for (i=0;i<16;++i) if (!((f[4][i] >= '0' && f[4][i] <= '9') ||
                              (f[4][i] >= 'a' && f[4][i] <= 'f'))) return 0;
    return !strcmp(f[5], "1") || !strcmp(f[5], "2") || !strcmp(f[5], "3");
}
int main(void) {
    char buf[160], next[2];
    if (!fgets(buf, sizeof(buf), stdin)) return 2;
    if (!strchr(buf, '\n') && !feof(stdin)) return 2;
    if (fgets(next, sizeof(next), stdin)) return 2;
    if (!check(buf)) { puts("LOCAL_REJECT"); return 2; }
    puts("LOCAL_ACCEPT:validation_only");
    return 0;
}
