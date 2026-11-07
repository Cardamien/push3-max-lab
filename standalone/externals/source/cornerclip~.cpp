// cornerclip~ - Airwindows OneCornerClip as a Max/MSP external (Mac, Windows, Push 3 Linux).
// DSP: OneCornerClip, Copyright (c) 2016 airwindows, MIT license
// (https://github.com/airwindows/airwindows/tree/master/plugins/LinuxVST/src/OneCornerClip).
// Max wrapper: Copyright (c) 2026 Cardamien, MIT license.
//
// Messages (left inlet): input <dB -12..24>, posthr <dB>, negthr <dB>, voicing <0..1>, mix <0..1>.
// The DSP loop is a line-for-line port of OneCornerClipProc.cpp; only the parameter
// scaling moved from Airwindows' 0..1 knobs to the units above.

#include "ext.h"
#include "ext_obex.h"
#include "z_dsp.h"

#include <math.h>
#include <stdint.h>
#include <stdlib.h>

typedef struct _cornerclip {
	t_pxobject ob;
	double inputDb;     // Airwindows A: (A*36)-12 dB
	double posThr;      // Airwindows B: linear 0..1
	double negThr;      // Airwindows C: linear 0..1
	double voicing;     // Airwindows D
	double wet;         // Airwindows E
	double sampleRate;
	double lastSampleL, lastSampleR;
	uint32_t fpdL, fpdR;
} t_cornerclip;

static t_class *cornerclip_class = NULL;

static double db_to_linear(double db) { return pow(10.0, db / 20.0); }

static double clampd(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }

static void cornerclip_input(t_cornerclip *x, double db) { x->inputDb = clampd(db, -12.0, 24.0); }

static void cornerclip_posthr(t_cornerclip *x, double db) { x->posThr = clampd(db_to_linear(db), 0.0, 1.0); }

static void cornerclip_negthr(t_cornerclip *x, double db) { x->negThr = clampd(db_to_linear(db), 0.0, 1.0); }

static void cornerclip_voicing(t_cornerclip *x, double v) { x->voicing = clampd(v, 0.0, 1.0); }

static void cornerclip_mix(t_cornerclip *x, double v) { x->wet = clampd(v, 0.0, 1.0); }

static void cornerclip_perform64(t_cornerclip *x, t_object *dsp64, double **ins, long numins, double **outs,
								 long numouts, long sampleframes, long flags, void *userparam)
{
	double *in1 = ins[0];
	double *in2 = ins[1];
	double *out1 = outs[0];
	double *out2 = outs[1];

	double overallscale = 1.0;
	overallscale /= 44100.0;
	overallscale *= x->sampleRate;

	double inputGain = db_to_linear(x->inputDb);
	double posThreshold = x->posThr;
	double posTargetL = posThreshold;
	double posTargetR = posThreshold;
	double negThreshold = -x->negThr;
	double negTargetL = negThreshold;
	double negTargetR = negThreshold;
	double voicing = x->voicing;
	if (voicing == 0.618) voicing = 0.618033988749894848204586;
	// special case: a perfect golden ratio as the default 0.618
	if (overallscale > 0.0) voicing /= overallscale;
	// translate to desired sample rate, 44.1K is the base
	if (voicing < 0.0) voicing = 0.0;
	if (voicing > 1.0) voicing = 1.0;
	double inverseHardness = 1.0 - voicing;
	bool clipEngage = false;

	double wet = x->wet;
	double drySampleL;
	double drySampleR;
	double inputSampleL;
	double inputSampleR;
	double lastSampleL = x->lastSampleL;
	double lastSampleR = x->lastSampleR;
	uint32_t fpdL = x->fpdL;
	uint32_t fpdR = x->fpdR;

	while (--sampleframes >= 0) {
		inputSampleL = *in1;
		inputSampleR = *in2;
		if (fabs(inputSampleL) < 1.18e-23) inputSampleL = fpdL * 1.18e-17;
		if (fabs(inputSampleR) < 1.18e-23) inputSampleR = fpdR * 1.18e-17;
		drySampleL = inputSampleL;
		drySampleR = inputSampleR;

		if (inputGain != 1.0) {
			inputSampleL *= inputGain;
			inputSampleR *= inputGain;
			clipEngage = true;
			// if we are altering gain we will always process
		} else {
			clipEngage = false;
			// if we are not touching gain, we will bypass unless a clip is actively being softened
		}

		if (inputSampleL > posTargetL) {
			inputSampleL = (lastSampleL * voicing) + (posThreshold * inverseHardness);
			posTargetL = inputSampleL;
			clipEngage = true;
		} else {
			posTargetL = posThreshold;
		}

		if (inputSampleR > posTargetR) {
			inputSampleR = (lastSampleR * voicing) + (posThreshold * inverseHardness);
			posTargetR = inputSampleR;
			clipEngage = true;
		} else {
			posTargetR = posThreshold;
		}

		if (inputSampleL < negTargetL) {
			inputSampleL = (lastSampleL * voicing) + (negThreshold * inverseHardness);
			negTargetL = inputSampleL;
			clipEngage = true;
		} else {
			negTargetL = negThreshold;
		}

		if (inputSampleR < negTargetR) {
			inputSampleR = (lastSampleR * voicing) + (negThreshold * inverseHardness);
			negTargetR = inputSampleR;
			clipEngage = true;
		} else {
			negTargetR = negThreshold;
		}

		lastSampleL = inputSampleL;
		lastSampleR = inputSampleR;

		if (wet != 1.0) {
			inputSampleL = (inputSampleL * wet) + (drySampleL * (1.0 - wet));
			inputSampleR = (inputSampleR * wet) + (drySampleR * (1.0 - wet));
		}

		// begin 32 bit stereo floating point dither
		int expon;
		frexpf((float)inputSampleL, &expon);
		fpdL ^= fpdL << 13; fpdL ^= fpdL >> 17; fpdL ^= fpdL << 5;
		inputSampleL += ((double(fpdL) - uint32_t(0x7fffffff)) * 5.5e-36l * pow(2, expon + 62));
		frexpf((float)inputSampleR, &expon);
		fpdR ^= fpdR << 13; fpdR ^= fpdR >> 17; fpdR ^= fpdR << 5;
		inputSampleR += ((double(fpdR) - uint32_t(0x7fffffff)) * 5.5e-36l * pow(2, expon + 62));
		// end 32 bit stereo floating point dither

		if (clipEngage == false) {
			inputSampleL = *in1;
			inputSampleR = *in2;
		}
		// fall back to raw passthrough if at all possible

		*out1++ = inputSampleL;
		*out2++ = inputSampleR;
		in1++;
		in2++;
	}

	x->lastSampleL = lastSampleL;
	x->lastSampleR = lastSampleR;
	x->fpdL = fpdL;
	x->fpdR = fpdR;
}

static void cornerclip_dsp64(t_cornerclip *x, t_object *dsp64, short *count, double samplerate, long maxvectorsize,
							 long flags)
{
	x->sampleRate = samplerate > 0.0 ? samplerate : 44100.0;
	object_method(dsp64, gensym("dsp_add64"), x, cornerclip_perform64, 0, NULL);
}

static void cornerclip_assist(t_cornerclip *x, void *b, long m, long a, char *s)
{
	if (m == ASSIST_INLET) {
		snprintf(s, 256, a == 0 ? "(signal) Left in, messages input posthr negthr voicing mix" : "(signal) Right in");
	} else {
		snprintf(s, 256, a == 0 ? "(signal) Left out" : "(signal) Right out");
	}
}

static uint32_t cornerclip_seed(void)
{
	uint32_t fpd = 1;
	while (fpd < 16386) fpd = (uint32_t)rand() * (uint32_t)rand();
	return fpd;
}

static void *cornerclip_new(t_symbol *s, long argc, t_atom *argv)
{
	t_cornerclip *x = (t_cornerclip *)object_alloc(cornerclip_class);
	if (!x) return NULL;
	dsp_setup((t_pxobject *)x, 2);
	outlet_new((t_object *)x, "signal");
	outlet_new((t_object *)x, "signal");
	// Airwindows defaults: A 0.3333 (0 dB), B and C 0.966, D 0.618, E 1.0
	x->inputDb = 0.0;
	x->posThr = 0.966;
	x->negThr = 0.966;
	x->voicing = 0.618;
	x->wet = 1.0;
	x->sampleRate = sys_getsr() > 0 ? sys_getsr() : 44100.0;
	x->lastSampleL = x->lastSampleR = 0.0;
	x->fpdL = cornerclip_seed();
	x->fpdR = cornerclip_seed();
	return x;
}

extern "C" C74_EXPORT void ext_main(void *r)
{
	t_class *c = class_new("cornerclip~", (method)cornerclip_new, (method)dsp_free, sizeof(t_cornerclip), NULL,
						   A_GIMME, 0);
	class_addmethod(c, (method)cornerclip_dsp64, "dsp64", A_CANT, 0);
	class_addmethod(c, (method)cornerclip_assist, "assist", A_CANT, 0);
	class_addmethod(c, (method)cornerclip_input, "input", A_FLOAT, 0);
	class_addmethod(c, (method)cornerclip_posthr, "posthr", A_FLOAT, 0);
	class_addmethod(c, (method)cornerclip_negthr, "negthr", A_FLOAT, 0);
	class_addmethod(c, (method)cornerclip_voicing, "voicing", A_FLOAT, 0);
	class_addmethod(c, (method)cornerclip_mix, "mix", A_FLOAT, 0);
	class_dspinit(c);
	class_register(CLASS_BOX, c);
	cornerclip_class = c;
}
