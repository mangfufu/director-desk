import { planNavigation } from './planner.ts';
self.onmessage = event => {
    try { self.postMessage({ result: planNavigation(event.data.project, event.data.options) }); }
    catch (error) { self.postMessage({ error: (error as Error).message }); }
};
