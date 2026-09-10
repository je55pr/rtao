const appShellHtml = `
  <section class="shell" aria-label="Road Trip Adventure browser reconstruction">

    <section class="world" id="world">
      <div class="world-copy" id="empty-state">
        <div class="landing-copy">
          <p class="eyebrow">ROAD TRIP ADVENTURE ONLINE</p>
          <h1>Play from your own game copy.</h1>
          <p class="lede">A clean-room browser reconstruction of <em>Road Trip Adventure</em>. Import your own PAL disc image to explore the world and the features currently reconstructed.</p>
        </div>

        <label class="drop-zone" id="drop-zone">
          <input id="file-input" type="file" accept=".iso,.zip,.bin,.cue" multiple />
          <span class="drop-icon" aria-hidden="true">↑</span>
          <span class="drop-primary">Choose your game file</span>
          <span class="drop-secondary">ISO or ZIP, or select a BIN and CUE together</span>
          <span class="choose-button">Browse files</span>
        </label>

        <div class="landing-info">
          <section>
            <h2>How to start</h2>
            <ol>
              <li>Use your own PAL copy of Road Trip Adventure.</li>
              <li>Choose the disc image above. For BIN/CUE, select both files.</li>
              <li>After the first import, the game can restore from local browser storage.</li>
            </ol>
          </section>
          <section class="privacy-note">
            <h2>Your files stay local</h2>
            <p>Game data is processed and stored by your browser on this device. It is not uploaded to this site, and this project does not distribute original game assets.</p>
          </section>
        </div>
      </div>

      <div class="viewer" id="viewer" hidden></div>

      <div class="import-card" id="import-card" hidden role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <div>
          <p class="import-phase" id="import-phase">Preparing local import</p>
          <p class="import-detail" id="import-detail">Reading game image…</p>
        </div>
        <div class="progress-track"><span id="progress-bar"></span></div>
        <p class="progress-label" id="progress-label"></p>
        <button class="quiet-button" id="cancel-import" type="button">Cancel</button>
      </div>

      <div class="error-card" id="error-card" hidden role="alert">
        <p class="eyebrow">IMPORT STOPPED</p>
        <h2 id="error-title">That game image could not be opened.</h2>
        <p id="error-detail"></p>
        <button class="primary-button" id="try-again" type="button">Try another file</button>
      </div>

      <aside class="installed-panel" id="installed-panel" hidden>
        <p class="eyebrow">LOCAL INSTALL READY</p>
        <h2 id="viewer-title">The whole world</h2>
        <dl>
          <div><dt>Disc</dt><dd id="disc-version">PAL</dd></div>
          <div><dt>Sectors</dt><dd id="field-count">64</dd></div>
          <div><dt>Triangles</dt><dd id="triangle-count">—</dd></div>
          <div><dt>Residents</dt><dd id="resident-count">—</dd></div>
          <div id="drive-field-row" hidden><dt>Field</dt><dd id="drive-field">FLD/223</dd></div>
          <div id="drive-speed-row" hidden><dt>Speed</dt><dd id="drive-speed">0 km/h</dd></div>
          <div id="drive-surface-row" hidden><dt>Surface</dt><dd id="drive-surface">Paved road</dd></div>
        </dl>
        <label class="location-control">
          <span>View</span>
          <select id="world-location">
            <option value="world">Whole-world overview</option>
            <option value="223">Peach Town · FLD/223</option>
            <option value="113">Fuji City · FLD/113</option>
            <option value="203">White Mountain · FLD/203</option>
            <option value="233">Papaya Island · FLD/233</option>
            <option value="213">Mushroom Road · FLD/213</option>
            <option value="220">Peach–Fuji bridge · FLD/220</option>
            <option value="221">FLD/221</option>
            <option value="210">FLD/210</option>
            <option value="211">FLD/211</option>
            <option value="202">FLD/202</option>
            <option value="111">FLD/111</option>
            <option value="011">FLD/011</option>
            <option value="012">FLD/012</option>
            <option value="023">FLD/023</option>
          </select>
        </label>
        <div class="world-render-controls">
          <label class="location-control">
            <span>Time</span>
            <select id="world-time">
              <option value="12">Day · 12:00</option>
              <option value="17.5">Sunset · 17:30</option>
              <option value="18.25">Dusk · 18:15</option>
              <option value="22">Night · 22:00</option>
            </select>
          </label>
          <label class="location-control">
            <span>Visibility</span>
            <select id="world-visibility">
              <option value="extended" selected>Extended</option>
              <option value="authentic">Original PS2</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </label>
        </div>
        <button class="primary-button drive-button" id="drive-toggle" type="button" disabled>Start driving Q62</button>
        <p class="nearby-note" id="nearby-note" hidden></p>
        <p class="viewer-help" id="viewer-help">Drag to orbit · Scroll to zoom · Right-drag to pan</p>
        <button class="quiet-button" id="remove-install" type="button">Remove local install</button>
      </aside>

      <section class="dialogue-overlay" id="dialogue-overlay" hidden aria-live="polite">
        <p class="dialogue-speaker" id="dialogue-speaker"></p>
        <p class="dialogue-text" id="dialogue-text"></p>
        <div class="dialogue-actions">
          <span>E / Enter · continue</span>
          <button type="button" id="dialogue-continue">Continue</button>
          <button type="button" id="dialogue-close">Close</button>
        </div>
      </section>

      <section class="factory-interior" id="factory-interior" hidden aria-label="Fixed interior">
        <div class="factory-stage" id="factory-stage">
          <div class="factory-canvas-host" id="factory-canvas-host"></div>
          <section class="factory-dialogue" id="factory-dialogue" aria-live="polite">
            <p class="factory-speaker" id="factory-speaker">Q's Factory</p>
            <p class="factory-text" id="factory-text"></p>
            <div class="factory-choices" id="factory-choices"></div>
            <div class="factory-host-action" id="factory-host-action" hidden>
              <strong id="factory-action-title"></strong>
              <span id="factory-action-detail"></span>
              <div class="factory-numeric-choice" id="factory-numeric-choice" hidden>
                <button type="button" id="factory-numeric-decrement" aria-label="Decrease number">−</button>
                <output id="factory-numeric-value">01</output>
                <button type="button" id="factory-numeric-increment" aria-label="Increase number">+</button>
              </div>
              <div class="factory-paint-selector" id="factory-paint-selector" hidden>
                <div class="paint-swatches">
                  <span id="paint-primary-swatch" title="Primary body colour"></span>
                  <span id="paint-secondary-swatch" title="Secondary body colour"></span>
                  <span id="paint-wheel-swatch" title="Wheel colour"></span>
                </div>
                <div class="paint-channel-grid" id="paint-channel-grid"></div>
                <small id="paint-feedback">Choose the primary and secondary RGB444 channels.</small>
                <div class="paint-actions">
                  <button type="button" id="paint-cancel">Cancel</button>
                  <button type="button" id="paint-apply">Confirm paint</button>
                </div>
              </div>
            </div>
            <div class="factory-actions">
              <span id="factory-key-hint">E / Enter · continue</span>
              <button type="button" id="factory-continue">Continue</button>
              <button type="button" id="factory-return" hidden>Return to Q's Factory</button>
              <button type="button" id="factory-leave">Return to town</button>
            </div>
          </section>
          <section class="quick-pic-photo" id="quick-pic-photo" hidden aria-label="Quick-Pic photograph">
            <header>
              <p id="quick-pic-title">Quick-Pic No. 1</p>
              <span>1280 × 960 PNG</span>
            </header>
            <img id="quick-pic-image" alt="Captured Road Trip Adventure Quick-Pic photograph" />
            <footer>
              <span>Keep the picture to record it in your save.</span>
              <a id="quick-pic-download" download="rta-quick-pic-01.png">Save PNG</a>
              <button type="button" id="quick-pic-cancel">Retake</button>
              <button type="button" id="quick-pic-keep">Keep picture</button>
            </footer>
          </section>
          <section class="factory-parts" id="factory-parts" hidden aria-label="Change Q62 parts">
            <header class="parts-header">
              <div>
                <p>Q's Factory · Change Parts</p>
                <h2>Player Q62</h2>
              </div>
              <span>Owned native equipment</span>
            </header>
            <div class="parts-browser">
              <nav class="parts-categories" id="parts-categories" aria-label="Part categories"></nav>
              <div class="parts-list" id="parts-list" role="listbox" aria-label="Parts"></div>
              <aside class="parts-detail">
                <p class="parts-detail-category" id="parts-detail-category"></p>
                <h3 id="parts-detail-name"></h3>
                <p id="parts-detail-description"></p>
                <div class="parts-stats" id="parts-stats"></div>
              </aside>
            </div>
            <footer class="parts-actions">
              <span>← / → category · ↑ / ↓ part · E apply · Esc cancel</span>
              <button type="button" id="parts-cancel">Cancel</button>
              <button type="button" id="parts-apply">Fit selected parts</button>
            </footer>
          </section>
          <section class="factory-shop" id="factory-shop" hidden aria-label="Parts Shop catalogue">
            <header class="shop-header">
              <div>
                <p id="shop-subtitle">Original local stock</p>
                <h2 id="shop-title">Parts Shop</h2>
              </div>
              <div class="shop-header-status">
                <span id="shop-location">Peach Town</span>
                <strong id="shop-balance">0 Cake</strong>
              </div>
            </header>
            <nav class="shop-categories" id="shop-categories" aria-label="Parts Shop categories"></nav>
            <div class="shop-stock" id="shop-stock" role="listbox" aria-label="Parts Shop stock"></div>
            <aside class="shop-detail">
              <p id="shop-detail-category"></p>
              <h3 id="shop-detail-name"></h3>
              <strong id="shop-detail-price"></strong>
              <p id="shop-detail-description"></p>
              <small id="shop-limitation">Purchase and ownership state remain deferred until the original Cake/save table is decoded.</small>
            </aside>
            <footer class="shop-actions">
              <span id="shop-key-hint">← / → category · ↑ / ↓ item · Esc return</span>
              <button type="button" id="shop-purchase" hidden>Buy</button>
              <button type="button" id="shop-close">Return to counter</button>
            </footer>
          </section>
        </div>
      </section>
    </section>
  </section>
`;

export function installAppShell(host: HTMLElement): void {
  host.innerHTML = appShellHtml;
}
