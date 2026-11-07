// Calculatrice de la page Finance : évaluation d'une expression saisie, sans eval().
// Opérations : + − × ÷, parenthèses, virgule ou point décimal, et pourcentage.
// Pourcentage comme sur une calculatrice de poche : « 150 000 + 10 % » = 165 000 (ajouter 10 % du montant),
// « 150 000 − 10 % » = 135 000, « 150 000 × 10 % » = 15 000, « 25 % » seul = 0,25.

export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

type Token = { kind: "num"; value: number } | { kind: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" | "%" };

/** Remet les signes usuels (×, ÷, −, virgule, espaces des milliers) au format du calcul. */
export function normalizeExpression(input: string): string {
  return input
    .replace(/[×xX]/g, "*")
    .replace(/[÷:]/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/,/g, ".")
    .replace(/[\s  ]/g, "");
}

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i]!;
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expression.length && /[0-9.]/.test(expression[j]!)) j++;
      const raw = expression.slice(i, j);
      if ((raw.match(/\./g) ?? []).length > 1 || raw === ".") return null;
      tokens.push({ kind: "num", value: Number(raw) });
      i = j;
    } else if ("+-*/()%".includes(ch)) {
      tokens.push({ kind: "op", value: ch as Extract<Token, { kind: "op" }>["value"] });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}

/** Évalue l'expression. Les erreurs sont des messages en français, jamais une exception. */
export function evaluate(input: string): CalcResult {
  const expression = normalizeExpression(input);
  if (!expression) return { ok: false, error: "Saisissez un calcul." };
  const parsed = tokenize(expression);
  if (!parsed) return { ok: false, error: "Caractère non reconnu : utilisez des chiffres et + − × ÷ % ( )." };
  const tokens: Token[] = parsed;

  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (value: string) => {
    const t = peek();
    return t?.kind === "op" && t.value === value;
  };

  // Terme : produit de facteurs. « percent » : terme réduit à un seul pourcentage (pour « a + b % »).
  function term(): { value: number; percent: boolean } {
    let { value, percent } = factor();
    while (isOp("*") || isOp("/")) {
      const op = (tokens[pos++] as { value: string }).value;
      const right = factor();
      if (op === "*") value *= right.value;
      else {
        if (right.value === 0) throw new Error("Division par zéro impossible.");
        value /= right.value;
      }
      percent = false;
    }
    return { value, percent };
  }

  function expr(): number {
    let value = term().value;
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { value: string }).value;
      const right = term();
      // « a + b % » : b % de a.
      const amount = right.percent ? value * right.value : right.value;
      value = op === "+" ? value + amount : value - amount;
    }
    return value;
  }

  function factor(): { value: number; percent: boolean } {
    const t = peek();
    if (!t) throw new Error("Calcul incomplet.");
    let value: number;
    if (t.kind === "op" && (t.value === "-" || t.value === "+")) {
      pos++;
      const inner = factor();
      return { value: t.value === "-" ? -inner.value : inner.value, percent: inner.percent };
    }
    if (t.kind === "num") {
      pos++;
      value = t.value;
    } else if (t.value === "(") {
      pos++;
      value = expr();
      if (!isOp(")")) throw new Error("Parenthèse non fermée.");
      pos++;
    } else {
      throw new Error("Calcul incomplet.");
    }
    if (isOp("%")) {
      pos++;
      return { value: value / 100, percent: true };
    }
    return { value, percent: false };
  }

  try {
    const value = expr();
    if (pos < tokens.length) return { ok: false, error: isOp(")") ? "Parenthèse fermée en trop." : "Calcul incomplet." };
    if (!Number.isFinite(value)) return { ok: false, error: "Résultat trop grand." };
    // Arrondi d'affichage : 0,1 + 0,2 = 0,3 (et non 0,30000000000000004).
    return { ok: true, value: Number(value.toPrecision(12)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Calcul impossible." };
  }
}

/** Nombre au format français : 1 234 567,89. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 10 }).format(value);
}
