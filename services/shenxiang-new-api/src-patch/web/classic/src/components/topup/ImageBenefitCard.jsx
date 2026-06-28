import React from 'react';
import { Button, Card, Progress, Tag, Typography } from '@douyinfe/semi-ui';
import { Copy, Image, KeyRound, Link, RefreshCw } from 'lucide-react';

const { Text } = Typography;

function statusMeta(status, t) {
  switch (status) {
    case 'active':
      return { color: 'green', label: t('生效中') };
    case 'expired':
      return { color: 'grey', label: t('已过期') };
    case 'exhausted':
      return { color: 'orange', label: t('已用完') };
    case 'disabled':
      return { color: 'red', label: t('已停用') };
    default:
      return { color: 'grey', label: t('暂无福利包') };
  }
}

function formatTime(timestamp) {
  if (!timestamp || timestamp <= 0) return '-';
  return new Date(timestamp * 1000).toLocaleString();
}

function BenefitField({ icon, label, value, onCopy, t }) {
  return (
    <div className='rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-3 min-w-0'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2 text-slate-500 text-xs'>
          {icon}
          <span>{label}</span>
        </div>
        {value ? (
          <Button
            size='small'
            type='tertiary'
            icon={<Copy size={14} />}
            onClick={() => onCopy(value)}
          >
            {t('复制')}
          </Button>
        ) : null}
      </div>
      <div className='mt-2 font-mono text-xs break-all text-slate-900 dark:text-slate-100'>
        {value || '-'}
      </div>
    </div>
  );
}

const ImageBenefitCard = ({ benefit, loading, onRefresh, onCopy, t }) => {
  if (!loading && (!benefit || benefit.status === 'none' || !benefit.token_id)) {
    return null;
  }

  const used = Number(benefit?.used_images || 0);
  const total = Number(benefit?.total_images || 300);
  const remaining = Number(benefit?.remaining_images || 0);
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const meta = statusMeta(benefit?.status, t);

  return (
    <Card className='!rounded-2xl shadow-sm border-0' loading={loading}>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <div className='h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center'>
              <Image size={18} />
            </div>
            <div>
              <Typography.Text className='text-lg font-medium'>
                {t('1.5K 图像福利包')}
              </Typography.Text>
              <div className='text-xs text-slate-500 mt-1'>
                {benefit?.model || 'image 2电商商品图快速通道(1.5K)'}
              </div>
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <Tag color={meta.color} shape='circle'>
              {meta.label}
            </Tag>
            <Button
              size='small'
              type='tertiary'
              icon={<RefreshCw size={14} />}
              onClick={onRefresh}
            />
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <div className='rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3'>
            <Text type='secondary' size='small'>
              {t('成功生成')}
            </Text>
            <div className='mt-1 text-2xl font-semibold'>{used}</div>
          </div>
          <div className='rounded-xl bg-sky-50 dark:bg-sky-950/30 p-3'>
            <Text type='secondary' size='small'>
              {t('剩余张数')}
            </Text>
            <div className='mt-1 text-2xl font-semibold'>{remaining}</div>
          </div>
          <div className='rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3'>
            <Text type='secondary' size='small'>
              {t('有效期至')}
            </Text>
            <div className='mt-1 text-sm font-medium'>{formatTime(benefit?.expired_time)}</div>
          </div>
        </div>

        <div>
          <div className='flex justify-between text-xs text-slate-500 mb-1'>
            <span>{t('使用进度')}</span>
            <span>
              {used}/{total}
            </span>
          </div>
          <Progress percent={percent} showInfo={false} stroke='var(--semi-color-success)' />
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
          <BenefitField
            icon={<KeyRound size={14} />}
            label='API Key'
            value={benefit?.key}
            onCopy={onCopy}
            t={t}
          />
          <BenefitField
            icon={<Link size={14} />}
            label='Base URL'
            value={benefit?.base_url}
            onCopy={onCopy}
            t={t}
          />
        </div>
      </div>
    </Card>
  );
};

export default ImageBenefitCard;
