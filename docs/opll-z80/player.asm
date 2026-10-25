; OPZ prototype, standard 3.579545 MHz Z80, OPLL ports 7Ch/7Dh.
; CALL init with HL=data address. CALL tick exactly 60 times/second.
; All public routines preserve AF/BC/DE/HL/IX. Not reentrant.
; No BIOS hooks, slot setup, interrupt installation or DI/EI performed here.
; The host must serialize OPLL accesses and map data continuously.
        org 0xbe00
init:
        push af
        push de
        push hl
        ld (base),hl
        ld de,716
        add hl,de
        ld (cursor),hl
        ld hl,macro_stack
        ld (stack_ptr),hl
        xor a
        ld (wait_count),a
        ld (loop_enabled),a
        inc a
        ld (running),a
        pop hl
        pop de
        pop af
        ret

tick:
        push af
        push bc
        push de
        push hl
        push ix
        ld a,(running)
        or a
        jp z,done
        ld a,(wait_count)
        or a
        jr z,load_cursor
        dec a
        ld (wait_count),a
        jp nz,done
load_cursor:
        ld hl,(cursor)
        ld ix,(stack_ptr)
decode:
        ld a,(hl)
        inc hl
        cp 64
        jr c,raw_write
        cp 192
        jr c,wait_cmd
        jr z,call_cmd
        cp 193
        jr z,return_cmd
        cp 194
        jp z,end_cmd
        cp 196
        jp c,end_cmd
        cp 205
        jr c,note_cmd
        sub 205
        ld e,a
        ld d,0
        ex de,hl
        add hl,hl
        add hl,hl
        ld bc,512
        add hl,bc
        ex de,hl
        jr enter_macro
raw_write:
        ld e,(hl)
        inc hl
        call opll_write
        jr decode
wait_cmd:
        sub 63
        ld (wait_count),a
save_cursor:
        ld (cursor),hl
        ld (stack_ptr),ix
done:
        pop ix
        pop hl
        pop de
        pop bc
        pop af
        ret
call_cmd:
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
enter_macro:
        ld (ix+0),l
        ld (ix+1),h
        inc ix
        inc ix
        ld hl,(base)
        add hl,de
        jp decode
return_cmd:
        dec ix
        dec ix
        ld l,(ix+0)
        ld h,(ix+1)
        jp decode
note_cmd:
        sub 180
        ld c,a
        ld e,(hl)
        inc hl
        push hl
        ld d,0
        ex de,hl
        add hl,hl
        ld de,(base)
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld a,c
        call opll_write
        ld e,d
        ld a,c
        add a,16
        call opll_write
        pop hl
        jp decode
end_cmd:
        ld a,(loop_enabled)
        or a
        jr z,finish
        ld hl,(base)
        ld de,716
        add hl,de
        ld ix,macro_stack
        jp decode
finish:
        xor a
        ld (running),a
        jp save_cursor

stop:
        push af
        push bc
        push de
        xor a
        ld (running),a
        ld b,9
        ld c,0x20
stop_channel:
        ld a,c
        ld e,0
        call opll_write
        ld a,c
        add a,16
        ld e,15
        call opll_write
        inc c
        djnz stop_channel
        ld a,014
        ld e,0x20
        call opll_write
        pop de
        pop bc
        pop af
        ret

opll_write:
        out (0x7c),a
        nop
        nop
        nop
        ld a,e
        out (0x7d),a
        ; Explicit 84 T-state recovery, excluding RET / next dispatch.
        defs 21
        ret
code_end:

base:          equ 0xd000
cursor:        equ 0xd002
stack_ptr:     equ 0xd004
wait_count:    equ 0xd006
running:       equ 0xd007
loop_enabled:  equ 0xd008
macro_stack:   equ 0xd009
ram_end:       equ 0xd023
