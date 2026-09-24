#include "opll.h"
#include "ymfm_opl.h"
#include <algorithm>
#include <cmath>
#include <new>

namespace {
class Opll : public ymfm::ymfm_interface {
public:
    ymfm::ym2413 chip;
    ymfm::ym2413::output_data output{};
    const double ratio;
    uint64_t samples = 0, native = 0;
    double held = 0, previous = 0, dc = 0;

    Opll() : chip(*this), ratio(double(chip.sample_rate(3579545)) / 44100) {
        chip.reset();
    }

    double sample() {
        // Integrate each 44.1 kHz sample over the chip's native sample intervals.
        double position = samples * ratio, end = (++samples) * ratio, sum = 0;
        while (position < end - 1e-9) {
            if (native <= uint64_t(std::floor(position + 1e-9))) {
                chip.generate(&output);
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
    auto &chip = static_cast<Opll *>(p)->chip;
    chip.write(0, reg);
    chip.write(1, value);
}
extern "C" double msx_opll_calc(void *p) { return static_cast<Opll *>(p)->sample(); }
extern "C" void msx_opll_delete(void *p) { delete static_cast<Opll *>(p); }
