import React, { useState, useEffect, Suspense, lazy } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { AdminView } from '../components/admin/types';

// Performance: Lazy load heavy admin components
const Dashboard = lazy(() => import('../components/admin/Dashboard'));
const LocationManager = lazy(() => import('../components/admin/LocationManager'));
const QueueManager = lazy(() => import('../components/admin/QueueManager'));
const SystemSettingsManager = lazy(() => import('../components/admin/SystemSettingsManager'));
import { Icon } from '@skytree-photo-planner/ui';
import { useLocationData } from '../hooks/useLocationData';

const AdminPage: React.FC = () => {
  // State
  const { locations, loadLocations } = useLocationData();
  const [activeView, setActiveView] = useState<AdminView>('dashboard');

  // Effects
  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // View components
  const renderQueueManagementSection = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <Icon name="queue" size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              バックグラウンド処理管理
            </h3>
            <p className="text-sm text-gray-600">
              データ再計算とキュー管理を統合して行います
            </p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6">
          <div className="flex">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-4 flex-shrink-0">
              <Icon name="info" size={16} className="text-blue-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-blue-900">
                キュー管理について
              </h4>
              <p className="text-sm text-blue-700 mt-2 leading-relaxed">
                データ再計算、キュー統計、失敗したジョブの管理を専用画面で行えます。重い処理は自動的にバックグラウンドで実行されます。
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setActiveView('queue')}
          className="flex items-center space-x-3 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <Icon name="settings" size={18} />
          <span className="font-medium">キュー管理を開く</span>
        </button>
      </div>
    </div>
  );

  const renderPlaceholderView = (title: string, icon: 'data' | 'settings' = 'settings') => (
    <div className="space-y-8">
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-700 rounded-xl flex items-center justify-center shadow-sm">
          <Icon name={icon} size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600 mt-1">
            {title}の管理を行います
          </p>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm p-16 text-center border border-gray-100">
        <div className="mb-6">
          <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto">
            <Icon name={icon} size={40} className="text-gray-400" />
          </div>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-3">
          準備中
        </h3>
        <p className="text-gray-500 max-w-md mx-auto leading-relaxed">
          この機能は近日公開予定です。システムの継続的な改善により、より良い管理体験を提供します。
        </p>
      </div>
    </div>
  );

  // Component loading fallback
  const AdminLoadingFallback = ({ component }: { component: string }) => (
    <div className="min-h-96 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-3 border-blue-600 border-t-transparent"></div>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{component}を読み込み中</h3>
        <p className="text-gray-500">しばらくお待ちください...</p>
      </div>
    </div>
  );

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <Suspense fallback={<AdminLoadingFallback component="ダッシュボード" />}>
            <Dashboard locations={locations} />
          </Suspense>
        );
      
      case 'locations':
        return (
          <Suspense fallback={<AdminLoadingFallback component="撮影地管理" />}>
            <LocationManager 
              locations={locations} 
              onLocationsChange={loadLocations} 
            />
          </Suspense>
        );
      
      case 'queue':
        return (
          <Suspense fallback={<AdminLoadingFallback component="キュー管理" />}>
            <QueueManager />
          </Suspense>
        );
      
      case 'settings':
        return (
          <div className="space-y-6">
            <Suspense fallback={<AdminLoadingFallback component="システム設定" />}>
              <SystemSettingsManager />
            </Suspense>
            {renderQueueManagementSection()}
          </div>
        );
      
      case 'data':
        return renderPlaceholderView('データ管理', 'data');
      
      default:
        return renderPlaceholderView(activeView);
    }
  };

  return (
    <AdminLayout 
      activeView={activeView} 
      onViewChange={setActiveView}
    >
      {renderActiveView()}
    </AdminLayout>
  );
};

export default AdminPage;