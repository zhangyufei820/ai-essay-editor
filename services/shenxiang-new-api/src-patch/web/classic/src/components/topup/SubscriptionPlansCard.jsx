/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Divider,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  API,
  showError,
  showSuccess,
  renderQuota,
  openPaymentPage,
  submitPaymentForm,
} from '../../helpers';
import { RefreshCw, Sparkles } from 'lucide-react';
import SubscriptionPurchaseModal from './modals/SubscriptionPurchaseModal';
import {
  formatSubscriptionDuration,
  formatSubscriptionResetPeriod,
} from '../../helpers/subscriptionFormat';

const { Text } = Typography;

const MONTHLY_TEXT_VALUE_MULTIPLIER_BY_PLAN_ID = {
  2: 1.8,
  3: 1.9,
  4: 2.0,
  5: 2.05,
  6: 2.08,
};
const OPENAI_INPUT_EQUIVALENT_USD_PER_TEXT_CNY = 165.31 / 180;

// 过滤易支付方式
function getEpayMethods(payMethods = []) {
  return (payMethods || []).filter(
    (m) => m?.type && m.type !== 'stripe' && m.type !== 'creem',
  );
}

function formatCnyAmount(value) {
  if (!Number.isFinite(value)) return '¥0';
  return `¥${value.toLocaleString(undefined, {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })}`;
}

function formatUsdAmount(value) {
  if (!Number.isFinite(value)) return '$0';
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function getMonthlyQuota(plan) {
  const monthly = Number(plan?.monthly_amount_total || 0);
  if (monthly > 0) return monthly;
  return Number(plan?.total_amount || 0);
}

function getPlanAudience(plan, t) {
  const price = Number(plan?.price_amount || 0);
  if (price <= 100) return t('轻度体验');
  if (price <= 200) return t('日常使用');
  if (price <= 300) return t('个人高频使用首选');
  if (price <= 500) return t('重度开发和多项目用户');
  return t('团队、工作室和全天候使用');
}

function getPlanTextMultiplier(plan) {
  const id = Number(plan?.id || 0);
  if (MONTHLY_TEXT_VALUE_MULTIPLIER_BY_PLAN_ID[id]) {
    return MONTHLY_TEXT_VALUE_MULTIPLIER_BY_PLAN_ID[id];
  }
  const price = Number(plan?.price_amount || 0);
  if (price >= 1000) return 2.08;
  if (price >= 500) return 2.05;
  if (price >= 300) return 2.0;
  if (price >= 200) return 1.9;
  if (price >= 100) return 1.8;
  return 1.8;
}

function formatMultiplierText(value) {
  if (!Number.isFinite(value)) return '1.0x';
  const fixed = value.toFixed(2);
  return `${fixed.replace(/\.?0+$/, '')}x`;
}

function getPlanPositioning(plan, t) {
  const price = Number(plan?.price_amount || 0);
  if (Math.round(price) === 300) return t('最多人选择');
  if (price >= 1000) return t('团队容量，最高总额度');
  if (price >= 500) return t('重度用户，更高并发');
  if (price >= 200) return t('日常稳定，比入门更划算');
  return t('入门体验，适合先试用');
}

function getPlanQuotaSummary(plan) {
  const price = Number(plan?.price_amount || 0);
  const baseQuota = getMonthlyQuota(plan);
  const textMultiplier = getPlanTextMultiplier(plan);
  const textQuota = Math.round(baseQuota * textMultiplier);
  return {
    priceText: formatCnyAmount(price),
    quotaText: renderQuota(baseQuota, 2),
    textMultiplier,
    multiplierText: formatMultiplierText(textMultiplier),
    textQuotaText: renderQuota(textQuota, 2),
    openAIInputEquivalentText: formatUsdAmount(
      price * textMultiplier * OPENAI_INPUT_EQUIVALENT_USD_PER_TEXT_CNY,
    ),
  };
}

function MonthlyCardValueGuide({ t, plans = [] }) {
  const monthlyPlans = (plans || [])
    .map((p) => p?.plan)
    .filter((plan) => Number(plan?.price_amount || 0) > 0)
    .sort(
      (a, b) => Number(a?.price_amount || 0) - Number(b?.price_amount || 0),
    );

  if (!monthlyPlans.length) return null;

  return (
    <div className='rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 p-4'>
      <div className='space-y-3'>
        <div>
          <Typography.Title heading={6} style={{ margin: 0 }}>
            {t('月卡文本额度说明')}
          </Typography.Title>
          <Text type='tertiary' size='small'>
            {t(
              '月卡文本额度按档位阶梯放大，¥300 是个人高频使用首选；¥500/¥1000 面向重度用户和团队，提供更高并发与更大总额度。图片、视频等权益按活动规则独立计算。',
            )}
          </Text>
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'>
          {monthlyPlans.map((plan) => {
            const quotaSummary = getPlanQuotaSummary(plan);
            return (
              <div
                key={plan.id}
                className='rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-3'
              >
                <div className='flex items-center justify-between gap-2'>
                  <Text strong>{plan.title}</Text>
                  {Number(plan?.price_amount || 0) === 300 && (
                    <Tag color='purple' shape='circle' size='small'>
                      {t('最多人选择')}
                    </Tag>
                  )}
                </div>
                <div className='mt-2 text-xs text-gray-500'>
                  {t('套餐价格')} {quotaSummary.priceText}
                </div>
                <div className='mt-1 text-sm'>
                  <Text strong>{t('按量文本等值')} </Text>
                  <span className='text-blue-600 font-semibold'>
                    {quotaSummary.textQuotaText}
                  </span>
                  <Text type='tertiary' size='small'>
                    {' '}
                    ({quotaSummary.multiplierText})
                  </Text>
                </div>
                <div className='mt-1 text-xs text-gray-500'>
                  {getPlanPositioning(plan, t)} ·{' '}
                  {t('约 OpenAI 官网')}{' '}
                  {quotaSummary.openAIInputEquivalentText}{' '}
                  {t('输入等值用量')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const SubscriptionPlansCard = ({
  t,
  loading = false,
  plans = [],
  payMethods = [],
  enableOnlineTopUp = false,
  enableStripeTopUp = false,
  enableCreemTopUp = false,
  billingPreference,
  onChangeBillingPreference,
  activeSubscriptions = [],
  allSubscriptions = [],
  reloadSubscriptionSelf,
  withCard = true,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paying, setPaying] = useState(false);
  const [selectedEpayMethod, setSelectedEpayMethod] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const epayMethods = useMemo(() => getEpayMethods(payMethods), [payMethods]);
  const displayPlans = useMemo(
    () =>
      [...(plans || [])].sort((a, b) => {
        const priceA = Number(a?.plan?.price_amount || 0);
        const priceB = Number(b?.plan?.price_amount || 0);
        if (priceA !== priceB) return priceA - priceB;
        return (
          Number(a?.plan?.sort_order || 0) - Number(b?.plan?.sort_order || 0)
        );
      }),
    [plans],
  );

  const openBuy = (p) => {
    setSelectedPlan(p);
    setSelectedEpayMethod(epayMethods?.[0]?.type || '');
    setOpen(true);
  };

  const closeBuy = () => {
    setOpen(false);
    setSelectedPlan(null);
    setPaying(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadSubscriptionSelf?.();
    } finally {
      setRefreshing(false);
    }
  };

  const payStripe = async () => {
    if (!selectedPlan?.plan?.stripe_price_id) {
      showError(t('该套餐未配置 Stripe'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/stripe/pay', {
        plan_id: selectedPlan.plan.id,
      });
      if (res.data?.message === 'success') {
        if (!openPaymentPage(res.data.data?.pay_link)) {
          showError(t('支付跳转地址不安全'));
          return;
        }
        showSuccess(t('已打开支付页面'));
        closeBuy();
      } else {
        const errorMsg =
          typeof res.data?.data === 'string'
            ? res.data.data
            : res.data?.message || t('支付失败');
        showError(errorMsg);
      }
    } catch (e) {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  const payCreem = async () => {
    if (!selectedPlan?.plan?.creem_product_id) {
      showError(t('该套餐未配置 Creem'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/creem/pay', {
        plan_id: selectedPlan.plan.id,
      });
      if (res.data?.message === 'success') {
        if (!openPaymentPage(res.data.data?.checkout_url)) {
          showError(t('支付跳转地址不安全'));
          return;
        }
        showSuccess(t('已打开支付页面'));
        closeBuy();
      } else {
        const errorMsg =
          typeof res.data?.data === 'string'
            ? res.data.data
            : res.data?.message || t('支付失败');
        showError(errorMsg);
      }
    } catch (e) {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  const payEpay = async () => {
    if (!selectedEpayMethod) {
      showError(t('请选择支付方式'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/epay/pay', {
        plan_id: selectedPlan.plan.id,
        payment_method: selectedEpayMethod,
      });
      if (res.data?.message === 'success') {
        if (!submitPaymentForm({ url: res.data.url, params: res.data.data })) {
          showError(t('支付跳转地址不安全'));
          return;
        }
        showSuccess(t('已发起支付'));
        closeBuy();
      } else {
        const errorMsg =
          typeof res.data?.data === 'string'
            ? res.data.data
            : res.data?.message || t('支付失败');
        showError(errorMsg);
      }
    } catch (e) {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  // 当前订阅信息 - 支持多个订阅
  const hasActiveSubscription = activeSubscriptions.length > 0;
  const hasAnySubscription = allSubscriptions.length > 0;
  const disableSubscriptionPreference = !hasActiveSubscription;
  const isSubscriptionPreference =
    billingPreference === 'subscription_first' ||
    billingPreference === 'subscription_only';
  const displayBillingPreference =
    disableSubscriptionPreference && isSubscriptionPreference
      ? 'wallet_first'
      : billingPreference;
  const subscriptionPreferenceLabel =
    billingPreference === 'subscription_only' ? t('仅用订阅') : t('优先订阅');

  const planPurchaseCountMap = useMemo(() => {
    const map = new Map();
    (allSubscriptions || []).forEach((sub) => {
      const planId = sub?.subscription?.plan_id;
      if (!planId) return;
      map.set(planId, (map.get(planId) || 0) + 1);
    });
    return map;
  }, [allSubscriptions]);

  const planTitleMap = useMemo(() => {
    const map = new Map();
    (plans || []).forEach((p) => {
      const plan = p?.plan;
      if (!plan?.id) return;
      map.set(plan.id, plan.title || '');
    });
    return map;
  }, [plans]);

  const getPlanPurchaseCount = (planId) =>
    planPurchaseCountMap.get(planId) || 0;

  // 计算单个订阅的剩余天数
  const getRemainingDays = (sub) => {
    if (!sub?.subscription?.end_time) return 0;
    const now = Date.now() / 1000;
    const remaining = sub.subscription.end_time - now;
    return Math.max(0, Math.ceil(remaining / 86400));
  };

  // 计算单个订阅的使用进度
  const getUsagePercent = (sub) => {
    const total = Number(sub?.subscription?.amount_total || 0);
    const used = Number(sub?.subscription?.amount_used || 0);
    if (total <= 0) return 0;
    return Math.round((used / total) * 100);
  };

  const cardContent = (
    <>
      {/* 卡片头部 */}
      {loading ? (
        <div className='space-y-4'>
          {/* 我的订阅骨架屏 */}
          <Card className='!rounded-xl w-full' bodyStyle={{ padding: '12px' }}>
            <div className='flex items-center justify-between mb-3'>
              <Skeleton.Title active style={{ width: 100, height: 20 }} />
              <Skeleton.Button active style={{ width: 24, height: 24 }} />
            </div>
            <div className='space-y-2'>
              <Skeleton.Paragraph active rows={2} />
            </div>
          </Card>
          {/* 套餐列表骨架屏 */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 w-full px-1'>
            {[1, 2, 3].map((i) => (
              <Card
                key={i}
                className='!rounded-xl w-full h-full'
                bodyStyle={{ padding: 16 }}
              >
                <Skeleton.Title
                  active
                  style={{ width: '60%', height: 24, marginBottom: 8 }}
                />
                <Skeleton.Paragraph
                  active
                  rows={1}
                  style={{ marginBottom: 12 }}
                />
                <div className='text-center py-4'>
                  <Skeleton.Title
                    active
                    style={{ width: '40%', height: 32, margin: '0 auto' }}
                  />
                </div>
                <Skeleton.Paragraph active rows={3} style={{ marginTop: 12 }} />
                <Skeleton.Button
                  active
                  block
                  style={{ marginTop: 16, height: 32 }}
                />
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Space vertical style={{ width: '100%' }} spacing={8}>
          {/* 当前订阅状态 */}
          <Card className='!rounded-xl w-full' bodyStyle={{ padding: '12px' }}>
            <div className='flex items-center justify-between mb-2 gap-3'>
              <div className='flex items-center gap-2 flex-1 min-w-0'>
                <Text strong>{t('我的订阅')}</Text>
                {hasActiveSubscription ? (
                  <Tag
                    color='white'
                    size='small'
                    shape='circle'
                    prefixIcon={<Badge dot type='success' />}
                  >
                    {activeSubscriptions.length} {t('个生效中')}
                  </Tag>
                ) : (
                  <Tag color='white' size='small' shape='circle'>
                    {t('无生效')}
                  </Tag>
                )}
                {allSubscriptions.length > activeSubscriptions.length && (
                  <Tag color='white' size='small' shape='circle'>
                    {allSubscriptions.length - activeSubscriptions.length}{' '}
                    {t('个已过期')}
                  </Tag>
                )}
              </div>
              <div className='flex items-center gap-2'>
                <Select
                  value={displayBillingPreference}
                  onChange={onChangeBillingPreference}
                  size='small'
                  optionList={[
                    {
                      value: 'subscription_first',
                      label: disableSubscriptionPreference
                        ? `${t('优先订阅')} (${t('无生效')})`
                        : t('优先订阅'),
                      disabled: disableSubscriptionPreference,
                    },
                    { value: 'wallet_first', label: t('优先钱包') },
                    {
                      value: 'subscription_only',
                      label: disableSubscriptionPreference
                        ? `${t('仅用订阅')} (${t('无生效')})`
                        : t('仅用订阅'),
                      disabled: disableSubscriptionPreference,
                    },
                    { value: 'wallet_only', label: t('仅用钱包') },
                  ]}
                />
                <Button
                  size='small'
                  theme='light'
                  type='tertiary'
                  icon={
                    <RefreshCw
                      size={12}
                      className={refreshing ? 'animate-spin' : ''}
                    />
                  }
                  onClick={handleRefresh}
                  loading={refreshing}
                />
              </div>
            </div>
            {disableSubscriptionPreference && isSubscriptionPreference && (
              <Text type='tertiary' size='small'>
                {t('已保存偏好为')}
                {subscriptionPreferenceLabel}
                {t('，当前无生效订阅，将自动使用钱包')}
              </Text>
            )}

            {hasAnySubscription ? (
              <>
                <Divider margin={8} />
                <div className='max-h-64 overflow-y-auto pr-1 semi-table-body'>
                  {allSubscriptions.map((sub, subIndex) => {
                    const isLast = subIndex === allSubscriptions.length - 1;
                    const subscription = sub.subscription;
                    const totalAmount = Number(subscription?.amount_total || 0);
                    const usedAmount = Number(subscription?.amount_used || 0);
                    const remainAmount =
                      totalAmount > 0
                        ? Math.max(0, totalAmount - usedAmount)
                        : 0;
                    const planTitle =
                      planTitleMap.get(subscription?.plan_id) || '';
                    const remainDays = getRemainingDays(sub);
                    const usagePercent = getUsagePercent(sub);
                    const now = Date.now() / 1000;
                    const isExpired = (subscription?.end_time || 0) < now;
                    const isCancelled = subscription?.status === 'cancelled';
                    const isActive =
                      subscription?.status === 'active' && !isExpired;

                    return (
                      <div key={subscription?.id || subIndex}>
                        {/* 订阅概要 */}
                        <div className='flex items-center justify-between text-xs mb-2'>
                          <div className='flex items-center gap-2'>
                            <span className='font-medium'>
                              {planTitle
                                ? `${planTitle} · ${t('订阅')} #${subscription?.id}`
                                : `${t('订阅')} #${subscription?.id}`}
                            </span>
                            {isActive ? (
                              <Tag
                                color='white'
                                size='small'
                                shape='circle'
                                prefixIcon={<Badge dot type='success' />}
                              >
                                {t('生效')}
                              </Tag>
                            ) : isCancelled ? (
                              <Tag color='white' size='small' shape='circle'>
                                {t('已作废')}
                              </Tag>
                            ) : (
                              <Tag color='white' size='small' shape='circle'>
                                {t('已过期')}
                              </Tag>
                            )}
                          </div>
                          {isActive && (
                            <span className='text-gray-500'>
                              {t('剩余')} {remainDays} {t('天')}
                            </span>
                          )}
                        </div>
                        <div className='text-xs text-gray-500 mb-2'>
                          {isActive
                            ? t('至')
                            : isCancelled
                              ? t('作废于')
                              : t('过期于')}{' '}
                          {new Date(
                            (subscription?.end_time || 0) * 1000,
                          ).toLocaleString()}
                        </div>
                        {isActive && subscription?.next_reset_time > 0 && (
                          <div className='text-xs text-gray-500 mb-2'>
                            {t('下一次重置')}:{' '}
                            {new Date(
                              subscription.next_reset_time * 1000,
                            ).toLocaleString()}
                          </div>
                        )}
                        <div className='text-xs text-gray-500 mb-2'>
                          {t('总额度')}:{' '}
                          {totalAmount > 0 ? (
                            <Tooltip
                              content={`${t('原生额度')}：${usedAmount}/${totalAmount} · ${t('剩余')} ${remainAmount}`}
                            >
                              <span>
                                {renderQuota(usedAmount)}/
                                {renderQuota(totalAmount)} · {t('剩余')}{' '}
                                {renderQuota(remainAmount)}
                              </span>
                            </Tooltip>
                          ) : (
                            t('不限')
                          )}
                          {totalAmount > 0 && (
                            <span className='ml-2'>
                              {t('已用')} {usagePercent}%
                            </span>
                          )}
                        </div>
                        {!isLast && <Divider margin={12} />}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className='text-xs text-gray-500'>
                {t('购买套餐后即可享受模型权益')}
              </div>
            )}
          </Card>

          {/* 可购买套餐 - 标准定价卡片 */}
          {displayPlans.length > 0 ? (
            <>
              <div className='px-1'>
                <Text type='tertiary' size='small'>
                  {t('月卡优先给文本模型按量等值额度，额度仅用于模型调用，不等同于现金余额。')}
                </Text>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 w-full px-1'>
                {displayPlans.map((p) => {
                  const plan = p?.plan;
                  const price = Number(plan?.price_amount || 0);
                  const displayPrice = price.toFixed(
                    Number.isInteger(price) ? 0 : 2,
                  );
                  const isPopular = Math.round(price) === 300;
                  const limit = Number(plan?.max_purchase_per_user || 0);
                  const limitLabel =
                    limit > 0 ? `${t('限购')} ${limit}` : null;
                  const upgradeLabel = plan?.upgrade_group
                    ? `${t('升级分组')}: ${plan.upgrade_group}`
                    : null;
                  const quotaSummary = getPlanQuotaSummary(plan);
                  const resetText = formatSubscriptionResetPeriod(plan, t);
                  const resetLabel =
                    resetText === t('不重置')
                      ? `${t('额度规则')}: ${t('本月额度用完为止')}`
                      : `${t('额度重置')}: ${resetText}`;
                  const planBenefits = [
                    { label: `${t('适合')}: ${getPlanAudience(plan, t)}` },
                    {
                      label: `${t('有效期')}: ${formatSubscriptionDuration(plan, t)}`,
                    },
                    resetLabel ? { label: resetLabel } : null,
                    limitLabel ? { label: limitLabel } : null,
                    upgradeLabel ? { label: upgradeLabel } : null,
                  ].filter(Boolean);

                  return (
                    <Card
                      key={plan?.id}
                      className={`!rounded-xl transition-all hover:shadow-lg w-full h-full ${
                        isPopular ? 'ring-2 ring-blue-500' : ''
                      }`}
                      bodyStyle={{ padding: 0 }}
                    >
                      <div className='p-4 h-full flex flex-col'>
                        {/* 推荐标签 */}
                        {isPopular && (
                          <div className='mb-2'>
                            <Tag color='blue' shape='circle' size='small'>
                              <Sparkles size={10} className='mr-1' />
                              {t('最多人选择')}
                            </Tag>
                          </div>
                        )}
                        {/* 套餐名称 */}
                        <div className='mb-3'>
                          <Typography.Title
                            heading={5}
                            ellipsis={{ rows: 1, showTooltip: true }}
                            style={{ margin: 0 }}
                          >
                            {plan?.title || t('订阅套餐')}
                          </Typography.Title>
                        </div>

                        {/* 价格区域 */}
                        <div className='py-2'>
                          <div className='flex items-end justify-start gap-1'>
                            <span className='text-3xl font-bold text-blue-600'>
                              ¥
                              {displayPrice}
                            </span>
                            <Text type='tertiary' size='small'>
                              / {t('月')}
                            </Text>
                          </div>
                          <div className='mt-2 text-sm'>
                            <Text>{t('文本模型约')} </Text>
                            <span className='font-semibold text-blue-600'>
                              {quotaSummary.textQuotaText}
                            </span>
                            <Text> {t('按量等值额度')}</Text>
                          </div>
                          <div className='mt-1 flex flex-wrap items-center gap-2'>
                            <Tag color='blue' shape='circle' size='small'>
                              {quotaSummary.multiplierText} {t('文本额度')}
                            </Tag>
                            {isPopular && (
                              <Tag color='green' shape='circle' size='small'>
                                {t('最多人选择')}
                              </Tag>
                            )}
                            <Text type='tertiary' size='small'>
                              {t('30 天内用完为止')}
                            </Text>
                          </div>
                          <Text
                            type='tertiary'
                            size='small'
                            style={{ display: 'block', marginTop: 4 }}
                          >
                            {getPlanPositioning(plan, t)}
                          </Text>
                          <Text
                            type='tertiary'
                            size='small'
                            style={{
                              display: 'block',
                              marginTop: 2,
                              whiteSpace: 'normal',
                            }}
                          >
                            {t('约 OpenAI 官网')}{' '}
                            {quotaSummary.openAIInputEquivalentText}{' '}
                            {t('输入等值用量')}
                          </Text>
                        </div>

                        {/* 套餐权益描述 */}
                        <div className='flex flex-col items-start gap-1 pb-2'>
                          {planBenefits.map((item) => {
                            const content = (
                              <div className='flex items-center gap-2 text-xs text-gray-500'>
                                <Badge dot type='tertiary' />
                                <span>{item.label}</span>
                              </div>
                            );
                            if (!item.tooltip) {
                              return (
                                <div
                                  key={item.label}
                                  className='w-full flex justify-start'
                                >
                                  {content}
                                </div>
                              );
                            }
                            return (
                              <Tooltip key={item.label} content={item.tooltip}>
                                <div className='w-full flex justify-start'>
                                  {content}
                                </div>
                              </Tooltip>
                            );
                          })}
                        </div>

                        <div className='mt-auto'>
                          <Divider margin={12} />

                          {/* 购买按钮 */}
                          {(() => {
                            const count = getPlanPurchaseCount(p?.plan?.id);
                            const reached = limit > 0 && count >= limit;
                            const tip = reached
                              ? t('已达到购买上限') + ` (${count}/${limit})`
                              : '';
                            const buttonEl = (
                              <Button
                                theme={isPopular ? 'solid' : 'outline'}
                                type='primary'
                                block
                                disabled={reached}
                                className={
                                  isPopular && !reached
                                    ? '!bg-blue-600 !border-blue-600 hover:!bg-blue-700'
                                    : ''
                                }
                                onClick={() => {
                                  if (!reached) openBuy(p);
                                }}
                              >
                                {reached ? t('已达上限') : t('立即订阅')}
                              </Button>
                            );
                            return reached ? (
                              <Tooltip content={tip} position='top'>
                                {buttonEl}
                              </Tooltip>
                            ) : (
                              buttonEl
                            );
                          })()}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          ) : (
            <div className='text-center text-gray-400 text-sm py-4'>
              {t('暂无可购买套餐')}
            </div>
          )}
          <MonthlyCardValueGuide t={t} plans={displayPlans} />
        </Space>
      )}
    </>
  );

  return (
    <>
      {withCard ? (
        <Card className='!rounded-2xl shadow-sm border-0'>{cardContent}</Card>
      ) : (
        <div className='space-y-3'>{cardContent}</div>
      )}

      {/* 购买确认弹窗 */}
      <SubscriptionPurchaseModal
        t={t}
        visible={open}
        onCancel={closeBuy}
        selectedPlan={selectedPlan}
        paying={paying}
        selectedEpayMethod={selectedEpayMethod}
        setSelectedEpayMethod={setSelectedEpayMethod}
        epayMethods={epayMethods}
        enableOnlineTopUp={enableOnlineTopUp}
        enableStripeTopUp={enableStripeTopUp}
        enableCreemTopUp={enableCreemTopUp}
        purchaseLimitInfo={
          selectedPlan?.plan?.id
            ? {
                limit: Number(selectedPlan?.plan?.max_purchase_per_user || 0),
                count: getPlanPurchaseCount(selectedPlan?.plan?.id),
              }
            : null
        }
        onPayStripe={payStripe}
        onPayCreem={payCreem}
        onPayEpay={payEpay}
      />
    </>
  );
};

export default SubscriptionPlansCard;
