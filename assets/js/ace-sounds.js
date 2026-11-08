(() => {
    'use strict';

    // Small, locally generated sounds: no downloads, music, or looping audio.
    function create({ enabled = true } = {}) {
        let context, output, paper;
        const voices = new Set();

        function stop() {
            for (const voice of voices) {
                try { voice.source.stop(); } catch { /* Already ended. */ }
                voice.nodes.forEach(node => node.disconnect());
            }
            voices.clear();
        }

        function unlock() {
            if (!enabled || document.hidden) return Promise.resolve(false);
            try {
                if (!context || context.state === 'closed') {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (!AudioContext) return Promise.resolve(false);
                    context = new AudioContext();
                    output = context.createGain();
                    output.gain.value = .32;
                    output.connect(context.destination);
                    paper = context.createBuffer(1, Math.ceil(context.sampleRate * .5), context.sampleRate);
                    const samples = paper.getChannelData(0);
                    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
                    // A silent frame during the gesture also unlocks older iPhone browsers.
                    const silent = context.createBufferSource();
                    silent.buffer = context.createBuffer(1, 1, context.sampleRate);
                    silent.connect(output);
                    silent.onended = () => silent.disconnect();
                    silent.start();
                    context.onstatechange = () => {
                        // Never replay scheduled notes after a phone/audio interruption.
                        if (context.state !== 'running') stop();
                    };
                }
                // Called directly from a tap/key press, including after iOS interruptions.
                return (context.state === 'running' ? Promise.resolve() : context.resume())
                    .then(() => context.state === 'running', () => false);
            } catch {
                return Promise.resolve(false);
            }
        }

        function voice(source, nodes, start, duration) {
            const entry = { source, nodes: [source, ...nodes] };
            voices.add(entry);
            source.onended = () => {
                entry.nodes.forEach(node => node.disconnect());
                voices.delete(entry);
            };
            source.start(start);
            source.stop(start + duration + .02);
        }

        function envelope(start, duration, volume, attack = .008) {
            const gain = context.createGain();
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume, start + attack);
            gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
            gain.gain.linearRampToValueAtTime(0, start + duration + .01);
            gain.connect(output);
            return gain;
        }

        function note(frequency, start, duration = .26, volume = .16) {
            // Rounded, plucked notes with just a little warmth above the fundamental.
            for (const [multiple, level] of [[1, 1], [2, .16]]) {
                const oscillator = context.createOscillator();
                oscillator.type = 'sine';
                oscillator.frequency.value = frequency * multiple;
                const gain = envelope(start, duration, volume * level);
                oscillator.connect(gain);
                voice(oscillator, [gain], start, duration + .01);
            }
        }

        function tap(start, volume = .23) {
            const oscillator = context.createOscillator();
            oscillator.frequency.setValueAtTime(340, start);
            oscillator.frequency.exponentialRampToValueAtTime(190, start + .07);
            const gain = envelope(start, .09, volume, .003);
            oscillator.connect(gain);
            voice(oscillator, [gain], start, .1);
        }

        function oops(start) {
            // A small, rubbery downward slide: the joke lands with the exchanged cards.
            const oscillator = context.createOscillator();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(587.33, start);
            oscillator.frequency.exponentialRampToValueAtTime(220, start + .28);
            oscillator.frequency.linearRampToValueAtTime(246.94, start + .34);
            oscillator.frequency.linearRampToValueAtTime(196, start + .42);
            const gain = envelope(start, .44, .2, .018);
            oscillator.connect(gain);
            voice(oscillator, [gain], start, .45);
            note(196, start + .33, .19, .14);
        }

        function horn(frequency, start, duration, volume = .15) {
            // Rounded brass harmonics with a little sustain, rather than a sharp beep.
            for (const [multiple, level] of [[1, 1], [2, .34], [3, .14], [4, .06]]) {
                const oscillator = context.createOscillator();
                oscillator.frequency.value = frequency * multiple;
                const gain = context.createGain();
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(volume * level, start + .022);
                gain.gain.linearRampToValueAtTime(volume * level * .65, start + duration * .55);
                gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
                gain.gain.linearRampToValueAtTime(0, start + duration + .01);
                oscillator.connect(gain);
                gain.connect(output);
                voice(oscillator, [gain], start, duration + .01);
            }
        }

        function fanfare(at, crowned = false) {
            // A cheeky royal entrance; the rarer king cut gets a fuller final chord.
            horn(392, at, .14);
            horn(392, at + .17, .14);
            horn(523.25, at + .34, .25);
            const finish = at + (crowned ? .76 : .61);
            if (crowned) horn(659.25, at + .57, .18);
            horn(crowned ? 1046.5 : 783.99, finish, crowned ? .72 : .48, .14);
            [261.63, 329.63, 392].forEach(hz => horn(hz, finish, crowned ? .7 : .46, .055));
        }

        function impact(start, volume) {
            // The upper drum harmonics keep the low impact audible on phone speakers.
            for (const [multiple, level] of [[1, 1], [2, .34], [3, .16]]) {
                const oscillator = context.createOscillator();
                oscillator.frequency.setValueAtTime(170 * multiple, start);
                oscillator.frequency.exponentialRampToValueAtTime(85 * multiple, start + .48);
                const gain = envelope(start, .62, volume * level, .008);
                oscillator.connect(gain);
                voice(oscillator, [gain], start, .63);
            }
        }

        function doubleDoom(at) {
            // Two weighty blows for the dreaded ace cut, then a theatrical brass fall.
            impact(at, .28);
            horn(293.66, at, .32, .16);
            impact(at + .48, .36);
            horn(261.63, at + .48, .38, .18);
            horn(196, at + .83, .75, .18);
            [146.83, 233.08].forEach(hz => horn(hz, at + .83, .73, .055));
        }

        function brush(start, duration = .16, volume = .38, frequency = 1200) {
            const source = context.createBufferSource();
            source.buffer = paper;
            const filter = context.createBiquadFilter();
            filter.type = 'bandpass';
            filter.Q.value = .7;
            filter.frequency.setValueAtTime(frequency, start);
            filter.frequency.exponentialRampToValueAtTime(frequency * .55, start + duration);
            const gain = envelope(start, duration, volume, Math.min(.035, duration / 4));
            source.connect(filter);
            filter.connect(gain);
            voice(source, [filter, gain], start, duration + .01);
        }

        function play(kind) {
            // Drop missed sounds, rather than queuing them until audio becomes available.
            if (!enabled || document.hidden || context?.state !== 'running') return;
            try {
                const at = context.currentTime + .012;
                switch (kind) {
                    case 'deal':
                        [0, .09, .18].forEach(offset => brush(at + offset, .12, .32));
                        break;
                    case 'swap':
                    case 'badSwap':
                        brush(at, .25, .42, 1450);
                        brush(at + .14, .23, .3, 950);
                        if (kind === 'badSwap') oops(at + .57);
                        break;
                    case 'challenge':
                        brush(at, .13, .24);
                        break;
                    case 'hold':
                        tap(at);
                        break;
                    case 'cut':
                        brush(at, .14, .4, 900);
                        brush(at + .13, .18, .38, 1300);
                        tap(at + .28, .15);
                        break;
                    case 'king':
                        fanfare(at);
                        break;
                    case 'win':
                        [523.25, 659.25, 783.99].forEach((hz, i) => note(hz, at + i * .11, .28, .14));
                        break;
                    case 'loss':
                        // A quiet "next time", not a buzzer or a sad fanfare.
                        note(392, at, .24, .14);
                        note(329.63, at + .14, .3, .12);
                        break;
                    case 'crown':
                        brush(at, .14, .4, 900);
                        brush(at + .13, .18, .38, 1300);
                        tap(at + .28, .15);
                        fanfare(at + .42, true);
                        break;
                    case 'aceCut':
                        brush(at, .14, .4, 900);
                        brush(at + .13, .18, .38, 1300);
                        tap(at + .28, .15);
                        doubleDoom(at + .42);
                        break;
                }
            } catch {
                // Audio is optional; it must never interrupt a turn.
                stop();
            }
        }

        function setEnabled(value) {
            enabled = Boolean(value);
            if (!enabled) stop();
        }

        return { unlock, play, stop, setEnabled };
    }

    window.AceSounds = { create };
})();
