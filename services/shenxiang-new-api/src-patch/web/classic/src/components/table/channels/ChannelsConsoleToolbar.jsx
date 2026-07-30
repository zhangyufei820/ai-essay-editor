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

import React from 'react';
import {
  Button,
  Dropdown,
  Form,
  Modal,
  Popover,
  Select,
  Switch,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconDelete,
  IconMore,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSetting,
} from '@douyinfe/semi-icons';
import { useIsMobile } from '../../../hooks/common/useIsMobile';

const ChannelsConsoleToolbar = ({
  enableBatchDelete,
  selectedChannels,
  batchDeleteChannels,
  setShowBatchSetTag,
  testAllChannels,
  fixChannelsAbilities,
  updateAllChannelsBalance,
  deleteAllDisabledChannels,
  applyAllUpstreamUpdates,
  detectAllUpstreamUpdates,
  detectAllUpstreamUpdatesLoading,
  applyAllUpstreamUpdatesLoading,
  compactMode,
  setCompactMode,
  idSort,
  setIdSort,
  setEnableBatchDelete,
  setSelectedChannels,
  enableTagMode,
  setEnableTagMode,
  statusFilter,
  setStatusFilter,
  getFormValues,
  loadChannels,
  searchChannels,
  activeTypeKey,
  activePage,
  pageSize,
  setActivePage,
  setEditingChannel,
  setShowEdit,
  refresh,
  setShowColumnSelector,
  formInitValues,
  setFormApi,
  formApi,
  groupOptions,
  loading,
  searching,
  t,
}) => {
  const isMobile = useIsMobile();
  const selectedCount = selectedChannels?.length || 0;

  const confirmAction = (title, content, onOk) => {
    Modal.confirm({
      title,
      content,
      onOk,
      size: 'small',
      centered: true,
    });
  };

  const reloadForIdSort = (nextIdSort) => {
    localStorage.setItem('id-sort', nextIdSort + '');
    setIdSort(nextIdSort);
    const { searchKeyword, searchGroup, searchModel } = getFormValues();
    if (searchKeyword === '' && searchGroup === '' && searchModel === '') {
      loadChannels(
        activePage,
        pageSize,
        nextIdSort,
        enableTagMode,
        activeTypeKey,
        statusFilter,
      );
      return;
    }
    searchChannels(
      enableTagMode,
      activeTypeKey,
      statusFilter,
      activePage,
      pageSize,
      nextIdSort,
    );
  };

  const toggleTagMode = (nextTagMode) => {
    localStorage.setItem('enable-tag-mode', nextTagMode + '');
    setEnableTagMode(nextTagMode);
    setActivePage(1);
    loadChannels(1, pageSize, idSort, nextTagMode, activeTypeKey, statusFilter);
  };

  const toggleBatchMode = (nextBatchMode) => {
    localStorage.setItem('enable-batch-delete', nextBatchMode + '');
    setEnableBatchDelete(nextBatchMode);
    if (!nextBatchMode) {
      setSelectedChannels([]);
    }
  };

  const changeStatusFilter = (nextStatus) => {
    localStorage.setItem('channel-status-filter', nextStatus);
    setStatusFilter(nextStatus);
    setActivePage(1);
    loadChannels(1, pageSize, idSort, enableTagMode, activeTypeKey, nextStatus);
  };

  const resetSearch = () => {
    if (!formApi) return;
    formApi.reset();
    setTimeout(() => refresh(), 100);
  };

  const viewSettings = (
    <div className='channel-view-settings'>
      <div className='channel-view-settings__title'>{t('视图设置')}</div>
      {!isMobile && (
        <label className='channel-view-settings__row'>
          <span>{t('紧凑列表')}</span>
          <Switch
            size='small'
            checked={compactMode}
            aria-label={t('紧凑列表')}
            onChange={setCompactMode}
          />
        </label>
      )}
      <label className='channel-view-settings__row'>
        <span>{t('使用ID排序')}</span>
        <Switch
          size='small'
          checked={idSort}
          aria-label={t('使用ID排序')}
          onChange={reloadForIdSort}
        />
      </label>
      <label className='channel-view-settings__row'>
        <span>{t('标签聚合模式')}</span>
        <Switch
          size='small'
          checked={enableTagMode}
          aria-label={t('标签聚合模式')}
          onChange={toggleTagMode}
        />
      </label>
      <label className='channel-view-settings__row'>
        <span>{t('批量选择')}</span>
        <Switch
          size='small'
          checked={enableBatchDelete}
          aria-label={t('批量选择')}
          onChange={toggleBatchMode}
        />
      </label>
    </div>
  );

  return (
    <div className='channel-console-toolbar'>
      <div className='channel-console-toolbar__search-row'>
        <Form
          initValues={formInitValues}
          getFormApi={(api) => setFormApi(api)}
          onSubmit={() => searchChannels(enableTagMode)}
          allowEmpty={true}
          autoComplete='off'
          layout='horizontal'
          trigger='change'
          stopValidateWithError={false}
          className='channel-search-form'
        >
          <Form.Input
            size='small'
            field='searchKeyword'
            prefix={<IconSearch />}
            placeholder={t('渠道ID，名称，密钥，API地址')}
            aria-label={t('搜索渠道')}
            showClear
            pure
          />
          <Form.Input
            size='small'
            field='searchModel'
            prefix={<IconSearch />}
            placeholder={t('模型关键字')}
            aria-label={t('搜索模型')}
            showClear
            pure
          />
          <Form.Select
            size='small'
            field='searchGroup'
            placeholder={t('选择分组')}
            aria-label={t('选择分组')}
            optionList={[
              { label: t('选择分组'), value: null },
              ...groupOptions,
            ]}
            showClear
            pure
            onChange={() => {
              setTimeout(() => searchChannels(enableTagMode), 0);
            }}
          />
          <Button
            size='small'
            type='primary'
            htmlType='submit'
            icon={<IconSearch />}
            loading={loading || searching}
          >
            {t('查询')}
          </Button>
          <Button size='small' type='tertiary' onClick={resetSearch}>
            {t('重置')}
          </Button>
        </Form>

        <div className='channel-console-toolbar__primary-actions'>
          <Button
            size='small'
            type='primary'
            icon={<IconPlus />}
            onClick={() => {
              setEditingChannel({ id: undefined });
              setShowEdit(true);
            }}
          >
            {t('添加渠道')}
          </Button>
          <Tooltip content={t('刷新')}>
            <Button
              size='small'
              type='tertiary'
              icon={<IconRefresh />}
              aria-label={t('刷新')}
              onClick={refresh}
            />
          </Tooltip>
          <Tooltip content={t('列设置')}>
            <Button
              size='small'
              type='tertiary'
              icon={<IconSetting />}
              aria-label={t('列设置')}
              onClick={() => setShowColumnSelector(true)}
            />
          </Tooltip>
        </div>
      </div>

      <div className='channel-console-toolbar__control-row'>
        <div className='channel-console-toolbar__view-controls'>
          <div className='channel-status-filter'>
            <Typography.Text type='tertiary'>{t('状态')}</Typography.Text>
            <Select
              size='small'
              value={statusFilter}
              aria-label={t('状态筛选')}
              onChange={changeStatusFilter}
            >
              <Select.Option value='all'>{t('全部')}</Select.Option>
              <Select.Option value='enabled'>{t('已启用')}</Select.Option>
              <Select.Option value='disabled'>{t('已禁用')}</Select.Option>
            </Select>
          </div>

          <Popover
            trigger='click'
            position='bottomLeft'
            showArrow
            content={viewSettings}
          >
            <Button size='small' type='tertiary' icon={<IconSetting />}>
              {t('视图')}
            </Button>
          </Popover>

          <Dropdown
            size='small'
            trigger='click'
            position='bottomLeft'
            render={
              <Dropdown.Menu>
                <Dropdown.Item
                  onClick={() =>
                    confirmAction(
                      t('确定？'),
                      t('确定要测试所有未手动禁用渠道吗？'),
                      testAllChannels,
                    )
                  }
                >
                  {t('测试所有可用渠道')}
                </Dropdown.Item>
                <Dropdown.Item
                  onClick={() =>
                    confirmAction(
                      t('确定？'),
                      t('确定要更新所有已启用通道余额吗？'),
                      updateAllChannelsBalance,
                    )
                  }
                >
                  {t('更新渠道余额')}
                </Dropdown.Item>
                <Dropdown.Item
                  disabled={detectAllUpstreamUpdatesLoading}
                  onClick={() =>
                    confirmAction(
                      t('确定？'),
                      t(
                        '确定要仅检测全部渠道上游模型更新吗？（不执行新增/删除）',
                      ),
                      detectAllUpstreamUpdates,
                    )
                  }
                >
                  {t('检测上游模型更新')}
                </Dropdown.Item>
                <Dropdown.Item
                  disabled={applyAllUpstreamUpdatesLoading}
                  onClick={() =>
                    confirmAction(
                      t('确定？'),
                      t('确定要对全部渠道执行上游模型更新吗？'),
                      applyAllUpstreamUpdates,
                    )
                  }
                >
                  {t('处理上游模型更新')}
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item
                  onClick={() =>
                    confirmAction(
                      t('确定是否要修复数据库一致性？'),
                      t(
                        '进行该操作时，可能导致渠道访问错误，请仅在数据库出现问题时使用',
                      ),
                      fixChannelsAbilities,
                    )
                  }
                >
                  {t('修复数据库一致性')}
                </Dropdown.Item>
                <Dropdown.Item
                  type='danger'
                  onClick={() =>
                    confirmAction(
                      t('确定是否要删除禁用通道？'),
                      t('此修改将不可逆'),
                      deleteAllDisabledChannels,
                    )
                  }
                >
                  {t('删除全部禁用渠道')}
                </Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <Button
              size='small'
              type='tertiary'
              icon={<IconMore />}
              loading={
                detectAllUpstreamUpdatesLoading ||
                applyAllUpstreamUpdatesLoading
              }
            >
              {t('维护')}
            </Button>
          </Dropdown>
        </div>

        {enableBatchDelete && (
          <div className='channel-batch-bar' aria-live='polite'>
            <Typography.Text strong>
              {t('已选择')} {selectedCount}
            </Typography.Text>
            <Button
              size='small'
              type='tertiary'
              disabled={selectedCount === 0}
              onClick={() => setShowBatchSetTag(true)}
            >
              {t('设置标签')}
            </Button>
            <Button
              size='small'
              type='danger'
              icon={<IconDelete />}
              disabled={selectedCount === 0}
              onClick={() =>
                confirmAction(
                  t('确定是否要删除所选通道？'),
                  t('此修改将不可逆'),
                  batchDeleteChannels,
                )
              }
            >
              {t('删除')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelsConsoleToolbar;
