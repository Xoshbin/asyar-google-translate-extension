# Google Translate response shape

`translate.googleapis.com/translate_a/single` returns a 6+ element array.

```
[
  [                              // [0] = translated segments
    [translated, source, …],     // [0][0]
    [translated, source, …],     // [0][1]
    …
    [null, null, null, pron],    // [0][N] — romanization segment (when dt=rm)
  ],
  null,                          // [1]
  "ja",                          // [2] = detected source BCP-47 (when sl=auto)
  …
]
```

- `translatedText` = concatenation of `parsed[0][i][0]` for every `i` whose `parsed[0][i][0]` is a non-null string (skip the pronunciation segment).
- `pronunciation` = the `parsed[0][N][3]` value (or `parsed[0][N][2]` as a fallback for alt response variants) of the segment where `[0]` is null. Optional.
- `detectedFrom` = `parsed[2]` when `sl=auto`. Else equals the requested source.
