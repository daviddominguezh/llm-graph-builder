import React, { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Loader2, Send, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface AskAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAsk: (question: string) => Promise<string>;
  onSendToInput: (answer: string) => void;
  initialQuestion?: string | null;
  autoTrigger?: boolean;
}

/**
 * AskAIModal
 *
 * Modal for asking AI questions and getting answers.
 * Features:
 * - Text input for user question
 * - Ask button to get AI response
 * - Display AI response
 * - Send button to add response to message input
 */
export const AskAIModal: React.FC<AskAIModalProps> = ({
  isOpen,
  onClose,
  onAsk,
  onSendToInput,
  initialQuestion = null,
  autoTrigger = false,
}) => {
  const t = useTranslations('messages');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasTriggered, setHasTriggered] = useState(false);

  // Set initial question when modal opens
  React.useEffect(() => {
    if (initialQuestion && isOpen) {
      setQuestion(initialQuestion);
      setHasTriggered(false);
    }
  }, [initialQuestion, isOpen]);

  // Auto-trigger API call after question is set
  React.useEffect(() => {
    if (autoTrigger && question && isOpen && !hasTriggered && !isLoading) {
      setHasTriggered(true);
      setIsLoading(true);
      setError('');
      setAnswer('');

      onAsk(question)
        .then((response) => {
          setAnswer(response);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : t('Failed to get AI response'));
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [autoTrigger, question, isOpen, hasTriggered, isLoading, onAsk, t]);

  const handleAsk = async () => {
    if (!question.trim()) return;

    setIsLoading(true);
    setError('');
    setAnswer('');

    try {
      const response = await onAsk(question);
      setAnswer(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to get AI response'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (answer) {
      onSendToInput(answer);
      handleClose();
    }
  };

  const handleClose = () => {
    setQuestion('');
    setAnswer('');
    setError('');
    setIsLoading(false);
    setHasTriggered(false);
    onClose();
  };

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      handleClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[525px] z-[150]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={20} />
            {t('Ask AI')}
          </DialogTitle>
          <DialogDescription>{t('Ask a question and get an AI-powered answer')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Question Input */}
          <div className="flex flex-col space-y-2 gap-0">
            <label htmlFor="question" className="text-sm font-medium">
              {t('Your question')}
            </label>
            <Textarea
              id="question"
              placeholder={t('Enter your question here…')}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={isLoading}
              className="min-h-[100px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey && !isLoading) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
            />
          </div>

          {/* Ask Button */}
          <Button onClick={handleAsk} disabled={!question.trim() || isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('Asking…')}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {t('Ask')}
              </>
            )}
          </Button>

          {/* Error Display */}
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>
          )}

          {/* Answer Display */}
          {answer && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t('AI Response')}</label>
                <Button onClick={handleSend} size="sm" variant="outline" className="gap-2 rounded-md">
                  <Send className="h-4 w-4" />
                  {t('Send to Input')}
                </Button>
              </div>
              <div className="rounded-md bg-gray-50 p-3 text-sm whitespace-pre-wrap">
                {answer}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
