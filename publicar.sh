#!/bin/bash
# Assina uma versão nova na Mozilla, sobe no GitHub e avisa o Firefox pelo updates.json.
# Uso: ./publicar.sh 0.2.5
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
VERSAO="${1:?informe a versão nova, ex.: ./publicar.sh 0.2.5}"
REPO=vvwxx/teclado-firefox
XPI="web-ext-artifacts/teclado-$VERSAO.xpi"
LINK="https://github.com/$REPO/releases/download/v$VERSAO/teclado-$VERSAO.xpi"
[ -e "$XPI" ] && { echo "A versão $VERSAO já foi assinada. Use um número maior."; exit 1; }

python3 - "$VERSAO" "$LINK" <<'PY'
import json, sys
versao, link = sys.argv[1:]
def gravar(arquivo, dados):
    with open(arquivo, "w") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write("\n")
m = json.load(open("manifest.json"))
m["version"] = versao
gravar("manifest.json", m)
u = json.load(open("updates.json"))
u["addons"][m["browser_specific_settings"]["gecko"]["id"]]["updates"].append({"version": versao, "update_link": link})
gravar("updates.json", u)
PY

set -a; . ~/.config/web-ext/amo.env; set +a
npx -y web-ext@8 sign --channel unlisted --source-dir . --artifacts-dir web-ext-artifacts \
  --ignore-files 'web-ext-artifacts/**' updates.json publicar.sh --approval-timeout 600000
# A Mozilla devolve o arquivo com um prefixo aleatório no nome.
mv "$(ls web-ext-artifacts/*-"$VERSAO".xpi | grep -v /teclado-)" "$XPI"

git add -A
git commit -m "versão $VERSAO"
git push
gh release create "v$VERSAO" "$XPI" --repo "$REPO" --title "$VERSAO" --notes ""
echo "Publicada a $VERSAO. O Firefox baixa sozinho em até um dia, ou na hora em about:addons > Procurar atualizações."
