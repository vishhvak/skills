# Source-informed sound measurements

The bundled oscillator/noise voices approximate four transient families measured in the supplied Kit Langton clips. Original audio, decoded PCM and soundtrack slices are not bundled. The synthesizer is editable JavaScript in `assets/starter/sfx-voices.js`.

The measurements below use mono 48 kHz decoding, 5 ms RMS windows, a 1024-sample FFT and 256-sample hop. Dominant frequency is a bin measurement, not a claim of identical waveform or timbre.

| Voice | Representative source | Source active duration | Generated duration | Source / generated dominant frequency | Source / generated peak |
| --- | --- | --- | --- | --- | --- |
| softPulse | Model table, 0.425s | 155 ms | 150 ms | 468.75 / 468.75 Hz | -38.58 / -38.50 dBFS |
| crispTick | Routing, 2.975s | 80 ms | 80 ms | 3187.5 / 3187.5 Hz | -28.47 / -29.50 dBFS |
| dataBurst | Model table, 1.595s | 105 ms | 110 ms | 2390.63 / 2437.50 Hz | -32.80 / -32.00 dBFS |
| settleTone | Routing, 3.920s | 295 ms | 295 ms | 1312.5 / 1312.5 Hz | -25.66 / -26.00 dBFS |

The routing arrival sounds at 3.920, 11.125 and 18.325 seconds have smoothed-envelope correlations above 0.9988. The generated arrival has a peak-time difference of -1.15 ms and a 10–90% energy-span difference of -4.75 ms against the first source event. Generated crispTick and dataBurst spectral centroids are respectively 258 Hz and 579 Hz below their representatives. These residuals remain relevant even when frequencies and durations match.

The starter maps routing request and route events to crispTick and arrival to settleTone. Model updates use dataBurst. Registry source activity uses softPulse; availability changes use crispTick. These are semantic events emitted by the scene, including during manual exploration. They are not a parallel recording-time cue sheet. All initial, paused and discontinuous renders stay silent.

The workspace and document references contain no audio stream. Their scene configurations stay silent during playback and interaction.

## Verification limits

Browser checks demonstrated generated AudioBufferSources without media loaded, manual routing independent of the recording clock, silent examples, mute and cancellation. Numeric envelope and spectrum similarity does not prove a listening match. Oscillator/noise texture and some event associations remain approximate; full sound parity is pending. For another reference, measure its own sounds and state transitions rather than applying these four voices universally.
