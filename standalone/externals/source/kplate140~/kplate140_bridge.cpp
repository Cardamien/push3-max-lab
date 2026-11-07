// Drives Airwindows kPlate140 (source/airwindows/kPlate140, unchanged) through the audioeffectx.h stand-in.
// Copyright (c) 2026 Cardamien, MIT license.
#include "kplate140_bridge.h"
#include "kPlate140.h"

extern "C" {

void *kplate140_new(double sampleRate)
{
	kPlate140 *plate = new kPlate140(nullptr);
	plate->setSampleRate((float)sampleRate);
	return plate;
}

void kplate140_free(void *plate) { delete static_cast<kPlate140 *>(plate); }

void kplate140_samplerate(void *plate, double sampleRate) { static_cast<kPlate140 *>(plate)->setSampleRate((float)sampleRate); }

void kplate140_param(void *plate, int index, float value)
{
	if (index < 0 || index >= kNumParameters) return;
	value = value < 0.0f ? 0.0f : (value > 1.0f ? 1.0f : value);
	static_cast<kPlate140 *>(plate)->setParameter(index, value);
}

void kplate140_process(void *plate, double **ins, double **outs, int frames)
{
	static_cast<kPlate140 *>(plate)->processDoubleReplacing(ins, outs, frames);
}
}
