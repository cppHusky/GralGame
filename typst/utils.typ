#import "/book/utils.typ": *
#let noindent = []
#let section-outline = []
#let lesson(..args) = {
  for row in args.pos() {
    if type(row) == content {
      html.elem("div", attrs: (class: "narration"), row)
    } else {
      html.elem("div", attrs: (class: "turn", "data-speaker": row.at(0)), row.at(1))
    }
  }
}
#let after-lesson(..args) = html.elem("section", attrs: (class: "after-lesson"), lesson(..args))
#let ruby(char, pinyin-str) = html.elem("ruby", { char; html.elem("rt", pinyin(pinyin-str)) })
