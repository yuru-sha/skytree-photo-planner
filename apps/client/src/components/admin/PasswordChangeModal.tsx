import React from 'react';

// Types
export interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  passwordForm: PasswordForm;
  onPasswordFormChange: (field: keyof PasswordForm, value: string) => void;
  onPasswordChange: () => void;
  loading: boolean;
}

const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  isOpen,
  onClose,
  passwordForm,
  onPasswordFormChange,
  onPasswordChange,
  loading,
}) => {
  if (!isOpen) return null;

  // Handlers
  const handleClose = () => {
    onPasswordFormChange('currentPassword', '');
    onPasswordFormChange('newPassword', '');
    onPasswordFormChange('confirmPassword', '');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9a2 2 0 012-2m0 0V7a2 2 0 012-2m0 0V5a2 2 0 012-2m0 0h1m-5 5h1" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">パスワード変更</h2>
            <p className="text-sm text-gray-500">新しいパスワードを設定してください</p>
          </div>
        </div>

        <form className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              現在のパスワード
            </label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                onPasswordFormChange('currentPassword', e.target.value)
              }
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              placeholder="現在のパスワードを入力"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              新しいパスワード
            </label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                onPasswordFormChange('newPassword', e.target.value)
              }
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              placeholder="6 文字以上で入力"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              新しいパスワード（確認）
            </label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                onPasswordFormChange('confirmPassword', e.target.value)
              }
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              placeholder="もう一度入力してください"
            />
          </div>
        </form>

        <div className="mt-8 flex space-x-3">
          <button
            onClick={onPasswordChange}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all duration-200 font-medium"
          >
            {loading ? '変更中...' : '変更する'}
          </button>
          <button
            onClick={handleClose}
            className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all duration-200 font-medium"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasswordChangeModal;