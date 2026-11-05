#import "/math.typ": math-shorthands
#show: math-shorthands
#show figure: it => context if target() == "html" {
  html.elem("div", attrs: (class: "fig"), html.frame(it))
} else { it }
#show math.equation: it => context if target() == "html" {
  if it.block {
    html.elem("div", attrs: (class: "eq"), html.frame(it))
  } else {
    box(html.frame({ it; text(fill: rgb("#010203"), size: 0.1pt)[.] }))
  }
} else { it }
#include "lecture/有理函数积分.typ"
