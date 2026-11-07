// Stand-in for the VST 2 SDK's audioeffectx.h, enough to compile an Airwindows LinuxVST plugin unchanged inside a
// Max external. The plugin class is then driven directly: setSampleRate, setParameter, processDoubleReplacing.
// Copyright (c) 2026 Cardamien, MIT license.
#ifndef __audioeffect__
#define __audioeffect__

#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES  // Windows: M_PI and M_PI_4, used by the plugins
#endif
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int32_t VstInt32;
typedef void *audioMasterCallback;

enum VstPlugCategory { kPlugCategUnknown = 0, kPlugCategEffect, kPlugCategSynth, kPlugCategAnalysis,
	kPlugCategMastering, kPlugCategSpacializer, kPlugCategRoomFx, kPlugSurroundFx, kPlugCategRestoration,
	kPlugCategOfflineProcess, kPlugCategShell, kPlugCategGenerator };

enum { kVstMaxProgNameLen = 24, kVstMaxParamStrLen = 8, kVstMaxVendorStrLen = 64, kVstMaxProductStrLen = 64,
	kVstMaxEffectNameLen = 32 };

class AudioEffect {
public:
	virtual ~AudioEffect() {}
};

class AudioEffectX : public AudioEffect {
public:
	AudioEffectX(audioMasterCallback, VstInt32, VstInt32) {}
	void setNumInputs(VstInt32) {}
	void setNumOutputs(VstInt32) {}
	void setUniqueID(VstInt32) {}
	void canProcessReplacing(bool = true) {}
	void canDoubleReplacing(bool = true) {}
	void programsAreChunks(bool = true) {}
	void setSampleRate(float sr) { sampleRate = sr; }
	float getSampleRate() { return sampleRate; }

protected:
	float sampleRate = 44100.0f;
};

inline void vst_strncpy(char *dst, const char *src, size_t maxLen)
{
	strncpy(dst, src, maxLen);
	dst[maxLen] = 0;
}

inline void float2string(float value, char *text, VstInt32 maxLen) { snprintf(text, maxLen + 1, "%.3f", value); }

inline void int2string(VstInt32 value, char *text, VstInt32 maxLen) { snprintf(text, maxLen + 1, "%d", (int)value); }

inline void dB2string(float value, char *text, VstInt32 maxLen)
{
	if (value <= 0) vst_strncpy(text, "-oo", maxLen);
	else float2string((float)(20.0 * log10(value)), text, maxLen);
}

#endif
