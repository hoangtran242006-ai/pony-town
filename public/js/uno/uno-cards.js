class UnoCards {
  static symbol(card) {
    if (card.type === 'number') return String(card.value);
    if (card.type === 'skip') return 'SKIP';
    if (card.type === 'reverse') return 'REV';
    if (card.type === 'draw2') return '+2';
    if (card.type === 'wild') return 'WILD';
    if (card.type === 'wild4') return '+4';
    return '?';
  }

  static el(card, options = {}) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `uno-card uno-card-${card.color || 'wild'}${options.small ? ' uno-card-small' : ''}`;
    el.dataset.cardId = card.id;
    el.setAttribute('aria-label', `${card.color || 'wild'} ${UnoCards.symbol(card)}`);
    el.innerHTML = `<span class="uno-card-inner"><span class="uno-card-symbol">${UnoCards.symbol(card)}</span></span>`;
    return el;
  }
}
