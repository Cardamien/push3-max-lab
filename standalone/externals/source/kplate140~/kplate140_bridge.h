// C interface to Airwindows kPlate140, so the Max wrapper never includes the plugin's headers (and the plugin never
// sees Max's). Copyright (c) 2026 Cardamien, MIT license.
#ifndef KPLATE140_BRIDGE_H
#define KPLATE140_BRIDGE_H

#ifdef __cplusplus
extern "C" {
#endif

void *kplate140_new(double sampleRate);
void kplate140_free(void *plate);
void kplate140_samplerate(void *plate, double sampleRate);
// index 0 Input, 1 Regen, 2 DeRez, 3 Predlay, 4 Wetness; value 0..1 as in the plugin
void kplate140_param(void *plate, int index, float value);
void kplate140_process(void *plate, double **ins, double **outs, int frames);

#ifdef __cplusplus
}
#endif

#endif
