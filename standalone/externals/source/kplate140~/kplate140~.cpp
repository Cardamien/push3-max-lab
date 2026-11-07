// kplate140~ - Airwindows kPlate140 as a Max/MSP external (Mac, Windows, Push 3 Linux).
// DSP: kPlate140, Copyright (c) airwindows, MIT license, compiled unchanged from
// https://github.com/airwindows/airwindows/tree/master/plugins/LinuxVST/src/kPlate140 (rev 7623a1c, 2024-06-23).
// Max wrapper: Copyright (c) 2026 Cardamien, MIT license.
//
// Messages (left inlet), all 0..1 exactly as the plugin's knobs:
//   input (pad, 1 = unity), regen (decay), derez (internal sample rate, 1 = full), predelay, wetness
//   (0.5 = full dry and full wet; below adds verb under the dry, above fades the dry out).

#include "ext.h"
#include "ext_obex.h"
#include "z_dsp.h"

#include "kplate140_bridge.h"

typedef struct _kplate140 {
	t_pxobject ob;
	void *plate;
	double sampleRate;
} t_kplate140;

static t_class *kplate140_class = NULL;

static void kplate140_set(t_kplate140 *x, int index, double v) { kplate140_param(x->plate, index, (float)v); }

static void kplate140_input(t_kplate140 *x, double v) { kplate140_set(x, 0, v); }

static void kplate140_regen(t_kplate140 *x, double v) { kplate140_set(x, 1, v); }

static void kplate140_derez(t_kplate140 *x, double v) { kplate140_set(x, 2, v); }

static void kplate140_predelay(t_kplate140 *x, double v) { kplate140_set(x, 3, v); }

static void kplate140_wetness(t_kplate140 *x, double v) { kplate140_set(x, 4, v); }

static void kplate140_perform64(t_kplate140 *x, t_object *dsp64, double **ins, long numins, double **outs,
								long numouts, long sampleframes, long flags, void *userparam)
{
	kplate140_process(x->plate, ins, outs, (int)sampleframes);
}

static void kplate140_dsp64(t_kplate140 *x, t_object *dsp64, short *count, double samplerate, long maxvectorsize,
							long flags)
{
	if (samplerate > 0.0 && samplerate != x->sampleRate) {
		x->sampleRate = samplerate;
		kplate140_samplerate(x->plate, samplerate);
	}
	object_method(dsp64, gensym("dsp_add64"), x, kplate140_perform64, 0, NULL);
}

static void kplate140_assist(t_kplate140 *x, void *b, long m, long a, char *s)
{
	if (m == ASSIST_INLET) {
		snprintf(s, 256, a == 0 ? "(signal) Left in, messages input regen derez predelay wetness" : "(signal) Right in");
	} else {
		snprintf(s, 256, a == 0 ? "(signal) Left out" : "(signal) Right out");
	}
}

static void *kplate140_create(t_symbol *s, long argc, t_atom *argv)
{
	t_kplate140 *x = (t_kplate140 *)object_alloc(kplate140_class);
	if (!x) return NULL;
	x->sampleRate = sys_getsr() > 0 ? sys_getsr() : 44100.0;
	x->plate = kplate140_new(x->sampleRate);
	if (!x->plate) {
		object_error((t_object *)x, "could not allocate the plate");
		return NULL;
	}
	dsp_setup((t_pxobject *)x, 2);
	outlet_new((t_object *)x, "signal");
	outlet_new((t_object *)x, "signal");
	return x;
}

static void kplate140_destroy(t_kplate140 *x)
{
	dsp_free((t_pxobject *)x);
	if (x->plate) kplate140_free(x->plate);
}

extern "C" C74_EXPORT void ext_main(void *r)
{
	t_class *c = class_new("kplate140~", (method)kplate140_create, (method)kplate140_destroy, sizeof(t_kplate140), NULL,
						   A_GIMME, 0);
	class_addmethod(c, (method)kplate140_dsp64, "dsp64", A_CANT, 0);
	class_addmethod(c, (method)kplate140_assist, "assist", A_CANT, 0);
	class_addmethod(c, (method)kplate140_input, "input", A_FLOAT, 0);
	class_addmethod(c, (method)kplate140_regen, "regen", A_FLOAT, 0);
	class_addmethod(c, (method)kplate140_derez, "derez", A_FLOAT, 0);
	class_addmethod(c, (method)kplate140_predelay, "predelay", A_FLOAT, 0);
	class_addmethod(c, (method)kplate140_wetness, "wetness", A_FLOAT, 0);
	class_dspinit(c);
	class_register(CLASS_BOX, c);
	kplate140_class = c;
}
