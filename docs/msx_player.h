/* Portable C89 register-stream player. Include song.h first.
 * Call msx_song_start(), then msx_song_tick() once per MSX_SONG_HZ interrupt.
 * Provide void msx_write(unsigned char chip, unsigned char reg, unsigned char value).
 * No slot mapping, interrupts or mapper changes are performed here.
 * Entire array must be addressable in the current 64 KiB address space.
 */
#ifndef MSX_MUSIC_PLAYER_H
#define MSX_MUSIC_PLAYER_H
extern void msx_write(unsigned char chip, unsigned char reg, unsigned char value);
static unsigned int msx_pos, msx_wait;
static unsigned char msx_running;
static unsigned int msx_read16(void) {
    unsigned int value;
    value=msx_song_data[msx_pos++];
    value|=(unsigned int)msx_song_data[msx_pos++]<<8;
    return value;
}
static void msx_song_stop(void) {
    unsigned char i;
    msx_running=0;
    for(i=0;i<3;i++) msx_write(0,8+i,0);
    for(i=0;i<9;i++) msx_write(1,0x20+i,0);
    msx_write(2,0x8f,0);
}
static void msx_song_start(void) {
    msx_pos=0; msx_running=1; msx_wait=msx_read16();
}
static void msx_song_tick(void) {
    unsigned int count;
    unsigned char chip,reg,value;
    if(!msx_running) return;
    if(msx_wait) { msx_wait--; if(msx_wait) return; }
    do {
        count=msx_read16();
        while(count--) {
            chip=msx_song_data[msx_pos++];
            reg=msx_song_data[msx_pos++];
            value=msx_song_data[msx_pos++];
            msx_write(chip,reg,value);
        }
        msx_wait=msx_read16();
        if(msx_wait==0xffff) {
            if(!MSX_SONG_LOOP) { msx_running=0; return; }
            msx_pos=MSX_SONG_LOOP_OFFSET;
            (void)msx_read16(); /* Ignore the first packet's pre-loop delta. */
            msx_wait=0;
        }
    } while(!msx_wait);
}
#endif
