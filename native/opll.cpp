#include "opll.h"
#include "ymfm_opl.h"
#include <algorithm>
#include <cmath>
#include <new>

namespace {
class LiveYm2413 : public ymfm::ym2413 {
public:
    using ymfm::ym2413::ym2413;
    unsigned muted = 0;
    void generate(output_data *out) {
        if (!muted) { ymfm::ym2413::generate(out); return; }
        m_fm.clock(fm_engine::ALL_CHANNELS);
        m_fm.output(out->clear(), 5, 256, fm_engine::ALL_CHANNELS & ~muted);
        out->data[0] = (out->data[0] * 128) / 9;
        out->data[1] = (out->data[1] * 128) / 9;
    }
};
class Opll : public ymfm::ymfm_interface {
public:
    LiveYm2413 chip;
    ymfm::ym2413::output_data output{};
    const double ratio;
    uint64_t samples = 0, native = 0;
    double held = 0, previous = 0, dc = 0;
    unsigned registers[256]{}, sampled[256]{}, deferred[256]{};
    bool pending[256]{};

    void raw_write(unsigned reg, unsigned value) {
        chip.write(0, reg);
        chip.write(1, value);
        registers[reg] = value;
    }

    void write(unsigned reg, unsigned value) {
        reg &= 255;
        value &= 255;
        unsigned mask = (reg >= 0x20 && reg <= 0x28) ? 0x10 :
                        (reg == 0x0e ? 0x1f : 0);
        // ymfm samples key state during generate(). Preserve an off/on edge
        // received before that clock, without consuming an entire 60 Hz frame.
        if (mask && (sampled[reg] & ~registers[reg] & value & mask)) {
            deferred[reg] = value;
            pending[reg] = true;
        } else {
            pending[reg] = false;
            raw_write(reg, value);
        }
    }

    Opll() : chip(*this), ratio(double(chip.sample_rate(3579545)) / 44100) {
        chip.reset();
    }

    double sample() {
        // Integrate each 44.1 kHz sample over the chip's native sample intervals.
        double position = samples * ratio, end = (++samples) * ratio, sum = 0;
        while (position < end - 1e-9) {
            if (native <= uint64_t(std::floor(position + 1e-9))) {
                chip.generate(&output);
                for (unsigned slot = 0; slot < 10; ++slot) {
                    unsigned reg = slot == 9 ? 0x0e : 0x20 + slot;
                    sampled[reg] = registers[reg];
                    if (pending[reg]) {
                        pending[reg] = false;
                        raw_write(reg, deferred[reg]);
                    }
                }
                held = 0;
                for (unsigned i = 0; i < ymfm::ym2413::OUTPUTS; ++i)
                    held += output.data[i];
                ++native;
            }
            double next = std::min(end, double(native));
            sum += held * (next - position);
            position = next;
        }
        // Same 20 Hz DC blocker as the independently compared Retro SFX renderer.
        double x = sum / ratio;
        dc = x - previous + 0.997154 * dc;
        previous = x;
        // Fixed chip-level calibration; no per-note normalization or limiting.
        return dc * 0.625;
    }
};
}

extern "C" void *msx_opll_new(void) { return new (std::nothrow) Opll; }
extern "C" void msx_opll_write(void *p, unsigned reg, unsigned value) {
    static_cast<Opll *>(p)->write(reg, value);
}
extern "C" double msx_opll_calc(void *p) { return static_cast<Opll *>(p)->sample(); }
extern "C" void msx_opll_delete(void *p) { delete static_cast<Opll *>(p); }

extern "C" void msx_opll_mask(void *p, unsigned mask) { static_cast<Opll *>(p)->chip.muted = mask & 511; }
