/**
 * Pony Town Character Creator & Customizer
 * Real-time pixel art preview and customization of species, colors, manes, tails, and accessories.
 */

class CharacterCustomizer {
  constructor(game) {
    this.game = game;
    this.modalEl = document.getElementById('customizerModal');
    this.canvasEl = document.getElementById('customizerCanvas');
    this.ctx = this.canvasEl ? this.canvasEl.getContext('2d') : null;
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;

    // Working character copy being edited
    this.workingChar = this.createDefaultPony();
    this.previewFrame = 0;
    this.animInterval = null;

    this.setupUI();
  }

  createDefaultPony() {
    return {
      id: 'pony-' + Date.now(),
      name: 'Lovely Blossom',
      type: 'unicorn',
      colors: {
        coat: '#f8d0e7',
        hooves: '#d696be',
        mane: '#9b59b6',
        maneAccent: '#e056fd',
        tail: '#9b59b6',
        tailAccent: '#e056fd',
        eyes: '#2980b9',
        horn: '#f8d0e7',
        wings: '#f8d0e7'
      },
      style: {
        mane: 'curly',
        tail: 'fluffy',
        expression: 'happy',
        accessory: 'flower'
      }
    };
  }

  setupUI() {
    // Form Inputs
    this.nameInput = document.getElementById('custName');
    this.typeSelect = document.getElementById('custType');
    this.coatColor = document.getElementById('custCoatColor');
    this.hoovesColor = document.getElementById('custHoovesColor');
    this.maneStyle = document.getElementById('custManeStyle');
    this.maneColor = document.getElementById('custManeColor');
    this.maneAccent = document.getElementById('custManeAccent');
    this.tailStyle = document.getElementById('custTailStyle');
    this.tailColor = document.getElementById('custTailColor');
    this.tailAccent = document.getElementById('custTailAccent');
    this.eyesColor = document.getElementById('custEyesColor');
    this.exprSelect = document.getElementById('custExpression');
    this.accSelect = document.getElementById('custAccessory');

    const inputs = [
      this.nameInput, this.typeSelect, this.coatColor, this.hoovesColor,
      this.maneStyle, this.maneColor, this.maneAccent,
      this.tailStyle, this.tailColor, this.tailAccent,
      this.eyesColor, this.exprSelect, this.accSelect
    ];

    inputs.forEach(input => {
      if (input) {
        input.addEventListener('input', () => this.syncFromForm());
      }
    });

    // Buttons
    const btnRandom = document.getElementById('custRandomizeBtn');
    if (btnRandom) {
      btnRandom.addEventListener('click', () => this.randomize());
    }

    const btnSave = document.getElementById('custSaveBtn');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.saveAndApply());
    }

    const btnClose = document.getElementById('custCloseBtn');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.close());
    }
  }

  open(character = null) {
    if (character) {
      this.workingChar = JSON.parse(JSON.stringify(character));
    } else {
      this.workingChar = this.createDefaultPony();
    }

    this.populateForm();
    if (this.modalEl) this.modalEl.classList.add('open');

    // Start preview animation loop
    if (!this.animInterval) {
      this.animInterval = setInterval(() => {
        this.previewFrame++;
        this.renderPreview();
      }, 100);
    }
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove('open');
    if (this.animInterval) {
      clearInterval(this.animInterval);
      this.animInterval = null;
    }
  }

  populateForm() {
    const c = this.workingChar;
    if (this.nameInput) this.nameInput.value = c.name || '';
    if (this.typeSelect) this.typeSelect.value = c.type || 'earth';
    if (this.coatColor) this.coatColor.value = c.colors?.coat || '#f2d594';
    if (this.hoovesColor) this.hoovesColor.value = c.colors?.hooves || '#d5b36e';
    if (this.maneStyle) this.maneStyle.value = c.style?.mane || 'normal';
    if (this.maneColor) this.maneColor.value = c.colors?.mane || '#6b3e26';
    if (this.maneAccent) this.maneAccent.value = c.colors?.maneAccent || '#965a39';
    if (this.tailStyle) this.tailStyle.value = c.style?.tail || 'normal';
    if (this.tailColor) this.tailColor.value = c.colors?.tail || '#6b3e26';
    if (this.tailAccent) this.tailAccent.value = c.colors?.tailAccent || '#965a39';
    if (this.eyesColor) this.eyesColor.value = c.colors?.eyes || '#3c6e91';
    if (this.exprSelect) this.exprSelect.value = c.style?.expression || 'normal';
    if (this.accSelect) this.accSelect.value = c.style?.accessory || 'none';

    this.renderPreview();
  }

  syncFromForm() {
    this.workingChar.name = this.nameInput?.value.trim() || 'My Pony';
    this.workingChar.type = this.typeSelect?.value || 'earth';
    this.workingChar.colors = {
      coat: this.coatColor?.value || '#f2d594',
      hooves: this.hoovesColor?.value || '#d5b36e',
      mane: this.maneColor?.value || '#6b3e26',
      maneAccent: this.maneAccent?.value || '#965a39',
      tail: this.tailColor?.value || '#6b3e26',
      tailAccent: this.tailAccent?.value || '#965a39',
      eyes: this.eyesColor?.value || '#3c6e91',
      horn: this.coatColor?.value || '#f2d594',
      wings: this.coatColor?.value || '#f2d594'
    };
    this.workingChar.style = {
      mane: this.maneStyle?.value || 'normal',
      tail: this.tailStyle?.value || 'normal',
      expression: this.exprSelect?.value || 'normal',
      accessory: this.accSelect?.value || 'none'
    };

    this.renderPreview();
  }

  randomize() {
    const coats = ['#ffccd5', '#d4b3f5', '#99e0ff', '#ffeaa7', '#a8e6cf', '#ffbe53', '#fdfefe', '#34495e'];
    const manes = ['#e84393', '#6c5ce7', '#0984e3', '#00b894', '#fdcb6e', '#d63031', '#2d3436'];
    const eyes = ['#2980b9', '#27ae60', '#8e44ad', '#d35400', '#c0392b', '#16a085'];
    const types = ['earth', 'pegasus', 'unicorn', 'alicorn'];
    const maneStyles = ['normal', 'spiky', 'curly', 'ponytail', 'long'];
    const tailStyles = ['normal', 'fluffy', 'swish', 'short'];
    const expressions = ['normal', 'happy', 'smug', 'silly'];
    const accessories = ['none', 'hat', 'bandana', 'flower', 'glasses'];

    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const coat = pick(coats);
    const mane = pick(manes);

    this.workingChar.type = pick(types);
    this.workingChar.colors = {
      coat: coat,
      hooves: Sprites.adjustColor ? Sprites.adjustColor(coat, -30) : coat,
      mane: mane,
      maneAccent: Sprites.adjustColor ? Sprites.adjustColor(mane, 25) : mane,
      tail: mane,
      tailAccent: Sprites.adjustColor ? Sprites.adjustColor(mane, 25) : mane,
      eyes: pick(eyes),
      horn: coat,
      wings: coat
    };
    this.workingChar.style = {
      mane: pick(maneStyles),
      tail: pick(tailStyles),
      expression: pick(expressions),
      accessory: pick(accessories)
    };

    this.populateForm();
  }

  saveAndApply() {
    this.syncFromForm();
    this.game.saveCharacter(this.workingChar);
    this.close();
  }

  renderPreview() {
    if (!this.ctx || !this.canvasEl) return;
    this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

    // Subtle background
    this.ctx.fillStyle = '#375225';
    this.ctx.fillRect(0, 0, this.canvasEl.width, this.canvasEl.height);

    // Draw pony centered in preview
    const previewPony = {
      ...this.workingChar,
      dir: 'right',
      state: 'stand',
      action: 'idle',
      frame: this.previewFrame
    };

    Sprites.drawPony(this.ctx, previewPony, this.canvasEl.width / 2, this.canvasEl.height / 2 + 10, 4);
  }
}
