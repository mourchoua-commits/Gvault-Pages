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

static int self_test(void) {
    const char *cases[] = {
        "C-BORDER/1|GTHINK_PUBLIC|GTHINK_IMAGE|HELLO|0123456789abcdef|2",
        "C-BORDER/1|GTHINK_IMAGE|GTHINK_PRIVATE|ACK|fedcba9876543210|3",
        "C-BORDER/1|GTHINK_PUBLIC|GTHINK_PUBLIC|HELLO|0123456789abcdef|2",
        "C-BORDER/1|GTHINK_PUBLIC|UNKNOWN|HELLO|0123456789abcdef|2",
        "C-BORDER/1|GTHINK_PUBLIC|GTHINK_IMAGE|EXEC|0123456789abcdef|2",
        "C-BORDER/1|GTHINK_PUBLIC|GTHINK_IMAGE|HELLO|0123456789abcdef|9",
        "C-BORDER/1|GTHINK_PUBLIC|GTHINK_IMAGE|HELLO|abc|2",
        "C-BORDER/1|GTHINK_PUBLIC|GTHINK_IMAGE|HELLO|0123456789abcdef|2|EXTRA"
    };
    const int expected[] = {1,1,0,0,0,0,0,0};
    size_t i;
    for (i = 0; i < sizeof(expected)/sizeof(expected[0]); ++i) {
        char copy[160];
        strcpy(copy, cases[i]);
        if (check(copy) != expected[i]) {
            fprintf(stderr, "SELF_TEST_FAIL:%zu\n", i);
            return 1;
        }
    }
    puts("SELF_TEST_PASS:8");
    return 0;
}

int main(int argc, char **argv) {
    if (argc == 2 && !strcmp(argv[1], "--self-test")) return self_test();
    if (argc != 2 || strcmp(argv[1], "--validate")) {
        fputs("Usage: c_border --self-test | --validate < packet.txt\n", stderr);
        return 64;
    }
    char buf[160], next[2];
    if (!fgets(buf, sizeof(buf), stdin)) return 2;
    if (!strchr(buf, '\n') && !feof(stdin)) return 2;
    if (fgets(next, sizeof(next), stdin)) return 2;
    if (!check(buf)) { puts("LOCAL_REJECT"); return 2; }
    puts("LOCAL_ACCEPT:validation_only");
    return 0;
}
