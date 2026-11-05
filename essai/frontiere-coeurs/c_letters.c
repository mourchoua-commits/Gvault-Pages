/* GVAULT C-LETTER/1: public, offline UTF-8 alphabet checkpoints.
 * No networking, no identity claims, no semantic inference from letters.
 * cc -std=c11 -Wall -Wextra -Werror -pedantic c_letters.c -o c_letters
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

static int next_scalar(const unsigned char *s, size_t n, size_t *i, uint32_t *out) {
    if (*i >= n) return 0;
    uint32_t c = s[*i];
    if (c < 0x80) { *out = c; ++*i; return 1; }
    int len;
    if (c >= 0xc2 && c <= 0xdf) { c &= 0x1f; len = 2; }
    else if (c >= 0xe0 && c <= 0xef) { c &= 0x0f; len = 3; }
    else if (c >= 0xf0 && c <= 0xf4) { c &= 0x07; len = 4; }
    else return -1;
    if (*i + (size_t)len > n) return -1;
    for (int k = 1; k < len; ++k) {
        unsigned char v = s[*i + (size_t)k];
        if ((v & 0xc0) != 0x80) return -1;
        c = (c << 6) | (v & 0x3f);
    }
    if ((len == 2 && c < 0x80) || (len == 3 && c < 0x800) ||
        (len == 4 && c < 0x10000) || (c >= 0xd800 && c <= 0xdfff) ||
        c > 0x10ffff) return -1;
    *i += (size_t)len;
    *out = c;
    return 1;
}
static void point_name(uint32_t cp, char name[20]) {
    if (cp >= 'A' && cp <= 'Z') snprintf(name, 20, "C_%c", (char)cp);
    else if (cp >= 'a' && cp <= 'z') snprintf(name, 20, "C_%c", (char)(cp - 32));
    else if (cp == 32) strcpy(name, "C_SPACE");
    else if (cp == 10) strcpy(name, "C_NEWLINE");
    else if (cp >= '0' && cp <= '9') snprintf(name, 20, "C_DIGIT_%c", (char)cp);
    else snprintf(name, 20, "C_U%04X", (unsigned)cp);
}
static int show(const unsigned char *s, size_t n, int emit) {
    size_t i = 0, count = 0;
    while (i < n) {
        uint32_t cp = 0;
        int r = next_scalar(s, n, &i, &cp);
        if (r < 0) return 2;
        if (r == 0) break;
        char label[20];
        point_name(cp, label);
        if (emit) printf("%zu\t%s\tU+%04X\n", count, label, (unsigned)cp);
        ++count;
        if (count > 512) return 2;
    }
    if (emit) printf("LOCAL_POINTS:%zu (no delivery)\n", count);
    return 0;
}
static int selftest(void) {
    char label[20];
    for (unsigned c = 'A'; c <= 'Z'; ++c) {
        point_name(c, label);
        if (label[0]!='C' || label[1]!='_' || label[2]!=(char)c || label[3]) return 1;
    }
    const unsigned char *valid=(const unsigned char *)"A z é Ω 💚";
    if (show(valid, strlen((const char*)valid), 0)) return 2;
    const unsigned char invalid[]={0xc0, 0xaf};
    if (show(invalid, sizeof(invalid), 0)!=2) return 3;
    const unsigned char surrogate[]={0xed,0xa0,0x80};
    if (show(surrogate,sizeof(surrogate),0)!=2) return 4;
    puts("SELF_TEST_PASS:26_LETTERS_UTF8_AND_REJECTIONS");
    return 0;
}
int main(int argc, char **argv) {
    if (argc==2 && strcmp(argv[1],"--self-test")==0) return selftest();
    if (argc!=2 || strcmp(argv[1],"--points")!=0) {
        fputs("usage: c_letters --self-test | --points < utf8.txt\n", stderr);
        return 64;
    }
    unsigned char input[4097];
    size_t n=fread(input,1,sizeof(input),stdin);
    if (ferror(stdin) || n==sizeof(input)) return 2;
    if (n && input[n-1]=='\n') --n;
    if (n && input[n-1]=='\r') --n;
    return show(input,n,1);
}
