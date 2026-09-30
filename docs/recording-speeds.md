# Official recording speed metadata

Checked 2026-09-30. The [official Intermediate practice-file index](https://cwops.org/intermediate-practice-files/)
and [Intermediate v2.3 curriculum](https://cwa.cwops.org/wp-content/uploads/Practice-Instructions-Intermediate-ver.2.3.htm)
identify variants by WPM, but do not explicitly state their character timing.
This mapping combines those published labels with measurements of the original
audio. It does not infer timing from arbitrary filenames.

| Catalog family                                                  | Character WPM                    | Effective WPM                                |
| --------------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| Long QSO/story, prefix/suffix, short phrase/POTA/QSO/story/word | 25                               | Published variant: 10, 13, 15, 18, 20, or 25 |
| CWT                                                             | Published variant: 20, 25, or 30 | Same as character WPM, with normal spacing   |

For example, [ING7-18](https://cwa.cwops.org/wp-content/uploads/ING7_18.mp3)
uses 25 WPM characters with Farnsworth spacing for 18 effective WPM. Its
229.054-second catalog duration is about 3:49. All six ING7 variants retain
25 WPM character timing, including the normally spaced 25/25 variant.

## Measurement and scope

The first 15 seconds of each exact source were fetched and decoded in memory
with ffmpeg to mono 16-bit PCM at 16 kHz. A 1 ms peak-amplitude envelope,
thresholded at 25% of the excerpt peak, distinguished tone and silence;
fragments below 4 ms were discarded. Pairing tone with its intra-element gap
cancels envelope threshold/ramp trimming: approximately 45 ms dot plus 51 ms
gap is two 48 ms units; 141 ms dash plus 51 ms gap is four units. Character
WPM is 1200 divided by the unit length in milliseconds.

Every non-CWT family was sampled at both 10 and 18 effective WPM. Both speeds
had approximately 48 ms units, or 25 character WPM. At 18 effective WPM,
enlarged letter gaps were approximately 294 ms with threshold trimming,
consistent with Farnsworth spacing at 25/18. This is family sampling, not
measurement of every catalog file.

| Family       | 10 WPM sample                                                           | 18 WPM sample                                                           |
| ------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Long QSO     | [QSO201-10](https://cwops.org/wp-content/uploads/2022/07/qso201_10.mp3) | [QSO201-18](https://cwops.org/wp-content/uploads/2022/07/qso201_18.mp3) |
| Long story   | [SS101-10](https://cwops.org/wp-content/uploads/2022/11/SS101_10.mp3)   | [SS101-18](https://cwops.org/wp-content/uploads/2022/11/SS101_18.mp3)   |
| Prefix       | [DIS4-10](https://cwa.cwops.org/wp-content/uploads/DIS4_10.mp3)         | [DIS4-18](https://cwa.cwops.org/wp-content/uploads/DIS4_18.mp3)         |
| Short phrase | [PR101-10](https://cwa.cwops.org/wp-content/uploads/PR101_10.mp3)       | [PR101-18](https://cwa.cwops.org/wp-content/uploads/PR101_18.mp3)       |
| Short POTA   | [POTA101-10](https://cwa.cwops.org/wp-content/uploads/POTA101_10.mp3)   | [POTA101-18](https://cwa.cwops.org/wp-content/uploads/POTA101_18.mp3)   |
| Short QSO    | [QSO101-10](https://cwa.cwops.org/wp-content/uploads/QSO_101_10.mp3)    | [QSO101-18](https://cwa.cwops.org/wp-content/uploads/QSO_101_18.mp3)    |
| Short story  | [SL201-10](https://cwa.cwops.org/wp-content/uploads/SL201_10.mp3)       | [SL201-18](https://cwa.cwops.org/wp-content/uploads/SL201_18.mp3)       |
| Short word   | [WD101-10](https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3)       | [WD101-18](https://cwa.cwops.org/wp-content/uploads/WD101_18.mp3)       |
| Suffix       | [ED4-10](https://cwa.cwops.org/wp-content/uploads/ED4_10.mp3)           | [ED4-18](https://cwa.cwops.org/wp-content/uploads/ED4_18.mp3)           |

CWT samples differ: [CWT201-20](https://cwops.org/wp-content/uploads/2020/06/CWT-201-20.mp3)
has approximately 60 ms units; [CWT209-25](https://cwops.org/wp-content/uploads/2018/12/CWT-209-25.mp3)
has 48 ms units; [CWT213-30](https://cwops.org/wp-content/uploads/2018/12/CWT-213-30.mp3)
has 40 ms units. Each uses normal character spacing.

## App behavior

[Catalog matching](../src/client/recording-variants.ts) applies this mapping to
exact catalog URLs and the explicit verified replacement URLs. Unknown URLs,
including uncataloged Fundamental and Advanced recordings, retain unknown
timing. No course audio or curriculum content is stored in the repository.

New saves include each recording's character/effective WPM and measured seconds.
A session displays a shared speed only when every played recording agrees on
that speed. Switching between 25/15 and 25/18 retains 25 character WPM and
leaves the session's effective WPM blank; each source keeps its effective speed.
Assigned metadata distinguishes the published speed from character and effective
timing. Existing historical entries are not rewritten.

The practice review/edit form displays minutes:seconds rounded to the nearest
second and accepts either that format or a plain number of minutes. Saving an
unchanged displayed duration preserves its original measured precision, including
read-only copy results. Recording notes use the same rounding. APIs, exports,
goals, and totals continue to use numeric minutes.
