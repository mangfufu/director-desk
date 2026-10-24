import fs from 'node:fs/promises';
import { referenceFiles } from './builtin-skill-files.cjs';
import { digest, contentVersion, validateOfficialSkill } from '../desktop/skills/official-package.cjs';

// The skill changes with its instructions/contracts, not with the application version.
const sources = ['skills/director-desk/SKILL.md', ...referenceFiles.map(file => 'skills/director-desk/' + file),
    'src/automation/contract.ts', 'src/automation/file-contract.ts', 'src/automation/control-contract.ts', 'src/automation/extension-contract.ts', 'src/automation/tool-summaries.ts', 'src/automation/help-topics.ts', 'src/media/help.ts', 'src/automation/read-sections.ts', 'src/scenes/query-contract.ts'];
const contents = await Promise.all(sources.map(file => fs.readFile(file, 'utf8').then(text => text.replace(/\r\n/g, '\n'))));
const references = Object.fromEntries(referenceFiles.map((file, i) => [file, contents[i + 1]]));
const { version: releaseVersion } = JSON.parse(await fs.readFile('skills/director-desk/version.json', 'utf8'));
const payload = { name: 'director-desk', releaseVersion, contractVersion: digest(contents.slice(referenceFiles.length + 1)),
    entry: contents[0], instructions: references['references/online-workflow.md'], references };
payload.version = contentVersion(payload);
validateOfficialSkill(payload);
const destination = 'src/automation/builtin-skill.json', text = JSON.stringify(payload, null, 2) + '\n';
if (await fs.readFile(destination, 'utf8').catch(() => '') !== text) await fs.writeFile(destination, text);
console.log('Built versioned embedded director skill.');
