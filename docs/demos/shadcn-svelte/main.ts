import { mount } from 'svelte';

import App from './App.svelte';
import '../shadcn/index.css';

const target = document.getElementById('root');
if (target) mount(App, { target });
