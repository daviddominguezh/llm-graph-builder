import React, { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { ChevronDown, ChevronUp, ExternalLink, Package, RefreshCw, X } from 'lucide-react';

import { getOrderReceipt } from '@/app/components/messages/services/api';

import { Button } from '@/components/ui/button';

import { formatCurrency } from '@/app/components/messages/shared/utilStubs';

import type { BusinessSetupSchemaAPIType } from '@/app/types/business';
import type { Order } from '@/app/types/orders';

interface OrdersDialogProps {
  orders: Order[];
  loading: boolean;
  businessInfo: BusinessSetupSchemaAPIType | null;
  projectName: string;
  userID: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

/**
 * Get status badge color
 */
const getStatusColor = (status: Order['status']): string => {
  switch (status) {
    case 'unpaid':
      return 'bg-yellow-100 text-yellow-800';
    case 'paid':
      return 'bg-blue-100 text-blue-800';
    case 'confirmed':
      return 'bg-purple-100 text-purple-800';
    case 'sent':
      return 'bg-indigo-100 text-indigo-800';
    case 'received':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'payment-failed':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

/**
 * Format date to readable string
 */
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Order card component with expand/collapse functionality
 */
const OrderCard: React.FC<{
  order: Order;
  currency: string;
  isExpanded: boolean;
  onToggle: () => void;
  projectName: string;
}> = ({ order, currency, isExpanded, onToggle, projectName }) => {
  const t = useTranslations('messages');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [hasFetchedReceipt, setHasFetchedReceipt] = useState(false);

  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  // Fetch receipt URL when order has trackingReceipt and is expanded
  useEffect(() => {
    if (isExpanded && order.trackingReceipt && !hasFetchedReceipt) {
      setLoadingReceipt(true);
      setHasFetchedReceipt(true);
      getOrderReceipt(projectName, order.trackingReceipt)
        .then((response) => {
          if (response?.receipt) {
            setReceiptUrl(response.receipt);
          }
        })
        .catch((error) => {
          console.error('Error fetching receipt:', error);
        })
        .finally(() => {
          setLoadingReceipt(false);
        });
    }
  }, [isExpanded, order.trackingReceipt, projectName, hasFetchedReceipt]);

  return (
    <div className="border rounded-md bg-white overflow-hidden transition-all">
      {/* Card Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          {/* Status Badge */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}
            >
              {t(`order-status-${order.status}`)}
            </span>
            {order.id && (
              <span className="text-xs text-gray-500 font-semibold">
                #{order.id.substring(0, 4).toUpperCase()}
              </span>
            )}
          </div>

          {/* Order Info */}
          <div className="flex flex-col gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1">
              <span className="text-gray-600">{t('order-Date')}:</span>
              <span className="font-medium">{formatDate(order.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-600">{t('order-Items')}:</span>
              <span className="font-medium">{itemCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-600">{t('order-Total')}:</span>
              <span className="font-semibold">
                ${formatCurrency(order.amount.toString())} {currency.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Expand/Collapse Icon */}
        <div className="shrink-0 pt-1">
          {isExpanded ? (
            <ChevronUp size={20} className="text-gray-400" />
          ) : (
            <ChevronDown size={20} className="text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t space-y-3">
          {/* Items List */}
          <div>
            <h4 className="mt-3 text-xs font-semibold text-gray-700 mb-2">
              {t('order-Items')}:
            </h4>
            <div className="space-y-2">
              {order.items.map((item, idx) => (
                <div key={idx} className="text-sm bg-gray-50 p-2 rounded">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium">{item.productName}</p>
                      {item.personalizations && item.personalizations.length > 0 && (
                        <p className="text-xs text-gray-600 mt-1">
                          {item.personalizations.map((p, pIdx) => (
                            <span key={pIdx}>
                              {p.type}: {p.value}
                              {pIdx < (item.personalizations?.length || 0) - 1 && ' • '}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 shrink-0 ml-2">x{item.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Details */}
          <div className="space-y-2 text-sm">
            {/* Customer Info */}
            <div className="flex flex-col gap-2">
              <div>
                <span className="text-gray-600 text-xs">{t('Name')}:</span>
                <p className="font-medium">{order.name}</p>
              </div>
              <div>
                <span className="text-gray-600 text-xs">{t('Email')}:</span>
                <p className="font-medium truncate">{order.email}</p>
              </div>
            </div>

            {/* Address */}
            <div>
              <span className="text-gray-600 text-xs">{t('order-Address')}:</span>
              <p className="text-sm">
                {order.address.direccion}
                {order.address.detalle && `, ${order.address.detalle}`}
                <br />
                {order.address.barrio}, {order.address.cityName}
              </p>
            </div>

            {/* Payment Method */}
            {order.paymentMethod && (
              <div>
                <span className="text-gray-600 text-xs">{t('Payment Method')}:</span>
                <p className="font-medium">
                  {t(order.paymentMethod)}
                  {order.paidOnDelivery && ` (${t('Paid on delivery')})`}
                </p>
              </div>
            )}

            {/* Tracking Info */}
            {(order.trackingId || receiptUrl) && (
              <div className="space-y-1">
                {order.trackingId && (
                  <div>
                    <span className="text-gray-600 text-xs">{t('order-tracking-id-label')}:</span>
                    <p className="font-mono text-xs">{order.trackingId}</p>
                  </div>
                )}
                {receiptUrl && (
                  <div>
                    <span className="text-gray-600 text-xs block mb-1">
                      {t('order-receipt')}:
                    </span>
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      <ExternalLink size={14} />
                      {t('View Receipt')}
                    </a>
                  </div>
                )}
                {loadingReceipt && (
                  <div>
                    <span className="text-gray-600 text-xs">{t('order-receipt')}:</span>
                    <p className="text-xs text-gray-500">{t('Loading...')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const OrdersDialog: React.FC<OrdersDialogProps> = ({
  orders,
  loading,
  businessInfo,
  projectName,
  onClose,
  onRefresh,
}) => {
  const t = useTranslations('messages');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Get currency based on country code
  const getCurrency = (countryCode?: string): string => {
    if (countryCode === 'COL') return 'COP';
    return 'USD';
  };

  const currency = getCurrency(businessInfo?.info?.countryCode);

  // Sort orders by createdAt DESC (newest first)
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => b.createdAt - a.createdAt);
  }, [orders]);

  // Handle refresh button click
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Toggle order expansion
  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const isEmpty = sortedOrders.length === 0;

  return (
    <div className="bg-white rounded-md border border-gray-300 shadow-lg h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b shrink-0">
        <Package size={20} className="text-gray-700" />
        <h2 className="flex-1 font-semibold text-lg">{t('order-plural')}</h2>

        <Button
          variant="ghost"
          onClick={handleRefresh}
          disabled={isRefreshing || loading}
          className="w-8 h-8 rounded-md shrink-0 p-0"
          title={t('Recharge')}
        >
          <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
        </Button>

        <Button
          variant="ghost"
          onClick={onClose}
          className="w-8 h-8 rounded-md shrink-0 p-0"
          title={t('close')}
        >
          <X size={20} />
        </Button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="space-y-3 w-full">
              {/* Skeleton loading */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-md p-3 bg-gray-50 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Package size={48} className="text-gray-300" />
            <p className="text-gray-500">{t('You do not have orders yet.')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                currency={currency}
                isExpanded={expandedOrders.has(order.id || '')}
                onToggle={() => toggleOrder(order.id || '')}
                projectName={projectName}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with total count */}
      {!isEmpty && !loading && (
        <div className="border-t p-4 shrink-0">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">{t('Total Orders1')}:</span>
            <span className="font-semibold">{sortedOrders.length}</span>
          </div>
        </div>
      )}
    </div>
  );
};
