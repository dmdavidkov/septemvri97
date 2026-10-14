# septemvri97.eu

Сайтът на женския баскетболен клуб **БК Септември 97** от София. В него са програмата и резултатите на всички отбори, клубът и тренировките. Пише и как хора и фирми могат да подкрепят отбора: с дарение за конкретна кауза или с партньорство.

## За администраторите

Всичко за поддръжката на сайта е в **[уикито](https://github.com/dmdavidkov/septemvri97/wiki)**:

- [Достъп и роли](https://github.com/dmdavidkov/septemvri97/wiki/Достъп-и-роли): кой какво може да прави и как се дава достъп
- [Google таблицата](https://github.com/dmdavidkov/septemvri97/wiki/Google-таблицата): каузи, мачове и пакети
- [Каузи и дарения](https://github.com/dmdavidkov/septemvri97/wiki/Каузи-и-дарения)
- [Stripe](https://github.com/dmdavidkov/septemvri97/wiki/Stripe): плащания с карта, линкове, връщане на пари, преминаване към истински плащания
- [Мачове](https://github.com/dmdavidkov/septemvri97/wiki/Мачове) и [Новини от Facebook](https://github.com/dmdavidkov/septemvri97/wiki/Новини-от-Facebook)
- [Как се обновява сайтът](https://github.com/dmdavidkov/septemvri97/wiki/Как-се-обновява-сайтът)
- [Ако нещо не работи](https://github.com/dmdavidkov/septemvri97/wiki/Ако-нещо-не-работи)
- [Нов сезон](https://github.com/dmdavidkov/septemvri97/wiki/Нов-сезон)

Ако нещо не се появява на сайта, отворете [septemvri97.eu/?check](https://www.septemvri97.eu/?check). Там пише кои редове от таблицата са пропуснати и защо.

## За програмисти

Сайтът е обикновен HTML, CSS и JavaScript в `site/`, без компилиране. GitHub Actions (`.github/workflows/site.yml`) го тества и публикува в GitHub Pages и на всеки 30 минути обновява програмата от БФБ, новините от Facebook и даренията от Stripe. Правилата на проекта са в [CLAUDE.md](CLAUDE.md).

```bash
npm ci
npm test
npm run serve
```
