#ifndef MSX_OPLL_H
#define MSX_OPLL_H
#ifdef __cplusplus
extern "C" {
#endif
void *msx_opll_new(void);
void msx_opll_write(void *opll, unsigned reg, unsigned value);
double msx_opll_calc(void *opll);
void msx_opll_delete(void *opll);
#ifdef __cplusplus
}
#endif
#endif
