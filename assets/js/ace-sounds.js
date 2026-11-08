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
                        brush(at, .25, .42, 1450);
                        brush(at + .14, .23, .3, 950);
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
                        note(523.25, at, .25, .15);
                        note(783.99, at + .15, .32, .13);
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
                        [392, 523.25, 659.25, 783.99].forEach((hz, i) => note(hz, at + i * .1, .3, .14));
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
