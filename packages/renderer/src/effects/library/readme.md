# Effect Library

One file per visual effect. Each module exports the following:
`{ id, displayName, defaultParams, paramSchema, render }`.
Note that this includes its own render function, and parameters for modification.

Available effects include `gradient`, `solid`, `fire`, `digitalRain`, and `diagonalStripes`.
The `digitalRain` effect renders falling streaks reminiscent of the Matrix.
The `gradient` effect now supports arbitrary color stops for flexible palettes.
