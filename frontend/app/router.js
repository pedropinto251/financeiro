import { createRouter, createWebHistory } from 'vue-router';
import { useUser } from './lib/useUser';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import TransactionsView from './views/TransactionsView.vue';
import CategoriesView from './views/CategoriesView.vue';
import BudgetsView from './views/BudgetsView.vue';
import GoalsView from './views/GoalsView.vue';
import ShareView from './views/ShareView.vue';

const router = createRouter({
  history: createWebHistory('/'),
  scrollBehavior() { return { top: 0 }; },
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/movimentos', name: 'transactions', component: TransactionsView },
    { path: '/categorias', name: 'categories', component: CategoriesView },
    { path: '/budgets', name: 'budgets', component: BudgetsView },
    { path: '/objetivos', name: 'goals', component: GoalsView },
    { path: '/partilhar', name: 'share', component: ShareView },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
});

// Require a session for everything except the login page.
router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const { load, user } = useUser();
  await load();
  if (!user.value) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
