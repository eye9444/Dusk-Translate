const buildEnvironment = import.meta.env?.VITE_APP_ENV || 'development';
const buildVersion = import.meta.env?.VITE_APP_VERSION || 'dev';
const buildCommit = import.meta.env?.VITE_BUILD_SHA || 'local';

export function deploymentLabel(environment = buildEnvironment, version = buildVersion, commit = buildCommit) {
  if (environment === 'production') return '';
  const name = environment === 'staging' ? 'Staging' : environment === 'preview' ? 'Preview' : 'Local';
  return `${name} / v${version} / ${commit.slice(0, 7)}`;
}

export function markDeploymentEnvironment(element) {
  if (!element) return;
  const label = deploymentLabel();
  document.body.dataset.environment = buildEnvironment;
  if (!label) return;
  element.textContent = label;
  element.dataset.environment = buildEnvironment;
  element.title = 'This is not the production DuskTranslate website.';
  element.hidden = false;
}
