import { mountLocalization } from './i18n/dom.ts';
import { t } from './i18n/locale.ts';
import { showStartupError } from './ui/startup-error.ts';

// Language and failure recovery must not depend on a working graphics context.
mountLocalization();
document.title = t('导演台');
void import('./main.ts').catch(showStartupError);
