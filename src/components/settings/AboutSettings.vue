<script setup>
const props = defineProps({
  appVersion: { type: String, default: '--' },
  demoExists: { type: Boolean, default: false },
})

const emit = defineEmits(['show-onboarding', 'create-demo', 'reset-demo'])
</script>

<template>
  <!-- About / Legal -->
  <section class="settings-section">
    <h3 class="section-title">About</h3>
    <div class="settings-item">
      <label>Version</label>
      <span class="version-text">{{ appVersion }}</span>
    </div>
    <div class="settings-item">
      <span class="copyright-text">Copyright 2026 GraphCore. All rights reserved.</span>
    </div>
    <div class="settings-item">
      <button class="snapshot-btn" @click="emit('show-onboarding')" title="Show the welcome tutorial">
        Show Welcome
      </button>
    </div>
    <div class="settings-item">
      <div class="snapshot-actions">
        <button
          v-if="!demoExists"
          class="snapshot-btn"
          @click="emit('create-demo')"
          title="Create a demo workspace with sample data"
        >
          Create Demo Workspace
        </button>
        <button
          v-else
          class="snapshot-btn"
          @click="emit('reset-demo')"
          title="Reset demo workspace with fresh sample data"
        >
          Reset Demo Workspace
        </button>
      </div>
      <span class="settings-hint">{{
        demoExists ? 'Reset to get fresh sample data' : 'Creates sample nodes to explore features'
      }}</span>
    </div>
  </section>

  <section class="settings-section legal-section">
    <h3 class="section-title">Warranty Disclaimer</h3>
    <div class="legal-text">
      <p>
        THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
        TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.
      </p>
      <p>
        IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER
        IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE
        USE OR OTHER DEALINGS IN THE SOFTWARE.
      </p>
      <p>
        You assume all responsibility and risk for the use of this software. The developers make no guarantees regarding
        data integrity, availability, or security.
      </p>
    </div>
  </section>

  <section class="settings-section legal-section">
    <h3 class="section-title">Privacy Notice</h3>
    <div class="legal-text">
      <p>
        <strong>Data Storage:</strong> All your data is stored locally on your device. GraphCore does not transmit your
        data to external servers unless you explicitly configure AI features.
      </p>
      <p>
        <strong>AI Features:</strong> When AI features are enabled, note content may be sent to the configured AI
        provider (Ollama running locally, or an external OpenAI-compatible API). You control which provider receives
        your data through the AI settings.
      </p>
      <p>
        <strong>No Analytics:</strong> GraphCore does not collect usage analytics, telemetry, or personal information.
      </p>
      <p><strong>Local Backups:</strong> Snapshots and backups are stored locally on your device.</p>
    </div>
  </section>
</template>
