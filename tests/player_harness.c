#include <stdio.h>
#include "song.h"
static unsigned int test_frame;
void msx_write(unsigned char chip, unsigned char reg, unsigned char value) {
    printf("%u,%u,%u,%u\n", test_frame,chip,reg,value);
}
#include "msx_player.h"
int main(void) {
    msx_song_start();
    for(test_frame=0;test_frame<TEST_FRAME_LIMIT;test_frame++) msx_song_tick();
    return 0;
}
