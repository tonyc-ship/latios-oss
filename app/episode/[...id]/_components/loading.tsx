'use client'

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Clock, Loader2, AlertCircle } from 'lucide-react';

interface LoadingStep {
  id: string;
  title: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  description?: string;
}

interface EnhancedLoadingProps {
  currentStep?: string;
  steps?: LoadingStep[];
}

export default function Loading({ currentStep, steps }: EnhancedLoadingProps) {
  const { t, i18n } = useTranslation();
  
  // Default steps if not provided
  const defaultSteps: LoadingStep[] = [
    {
      id: 'lookup',
      title: t('loading.lookupSummary') || 'Checking channel information',
      status: 'pending'
    },
    {
      id: 'transcript',
      title: t('loading.checkTranscript') || 'Fetching episode data',
      status: 'pending'
    },
    {
      id: 'transcribing',
      title: t('loading.transcribing') || 'Transcribing audio (this may take a few minutes)',
      status: 'pending'
    },
    {
      id: 'summarizing',
      title: t('loading.summarizing') || 'Generating intelligent summary',
      status: 'pending'
    }
  ];

  const [currentSteps, setCurrentSteps] = useState<LoadingStep[]>(steps || defaultSteps);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Update steps when props change
  useEffect(() => {
    if (steps && steps.length > 0) {
      setCurrentSteps(steps);
    } else if (!steps || steps.length === 0) {
      setCurrentSteps(defaultSteps);
    }
  }, [steps, t]);

  // Update steps based on currentStep prop
  useEffect(() => {
    if (currentStep && currentSteps.length > 0) {
      const stepIndex = currentSteps.findIndex(step => step.id === currentStep);
      if (stepIndex !== -1) {
        setCurrentStepIndex(stepIndex);
      }
    }
  }, [currentStep, currentSteps]);

  // Auto-set first step as loading if no current step is specified and we have steps
  useEffect(() => {
    if (!currentStep && currentSteps.length > 0 && !currentSteps.some(s => s.status === 'loading')) {
      const newSteps = [...currentSteps];
      newSteps[0].status = 'loading';
      setCurrentSteps(newSteps);
    }
  }, [currentStep, currentSteps]);

  // Auto-advance through steps for demo purposes if no specific step is provided
  useEffect(() => {
    if (!currentStep && !steps) {
      const interval = setInterval(() => {
        setCurrentStepIndex(prev => {
          if (prev < currentSteps.length - 1) {
            const newSteps = [...currentSteps];
            newSteps[prev].status = 'completed';
            newSteps[prev + 1].status = 'loading';
            setCurrentSteps(newSteps);
            return prev + 1;
          } else {
            clearInterval(interval);
            return prev;
          }
        });
      }, 2000); // Advance every 2 seconds for demo

      return () => clearInterval(interval);
    }
  }, [currentStep, steps, currentSteps]);

  const getStepIcon = (step: LoadingStep) => {
    switch (step.status) {
      case 'completed':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'loading':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStepTextColor = (step: LoadingStep) => {
    switch (step.status) {
      case 'completed':
        return 'text-green-700 dark:text-green-400';
      case 'loading':
        return 'text-blue-700 dark:text-blue-400 font-medium';
      case 'error':
        return 'text-red-700 dark:text-red-400';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  const getStepBackgroundColor = (step: LoadingStep) => {
    switch (step.status) {
      case 'completed':
        return 'bg-green-50 dark:bg-green-900/20';
      case 'loading':
        return 'bg-blue-50 dark:bg-blue-900/20';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20';
      default:
        return 'bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const completedSteps = currentSteps.filter(s => s.status === 'completed').length;
  const hasLoadingStep = currentSteps.some(s => s.status === 'loading');
  const progressPercentage = ((completedSteps + (hasLoadingStep ? 0.5 : 0)) / currentSteps.length) * 100;

  // Filter steps to show only completed and current loading step
  const visibleSteps = currentSteps.filter(step => 
    step.status === 'completed' || step.status === 'loading'
  );

  return (
    <div className="container mx-auto py-16 flex flex-col items-center justify-center min-h-[400px]">
      {/* Main loading spinner */}
      <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-8"></div>
      
      {/* Main title */}
      <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
        {t('loading.title') || 'Preparing your summary'}
      </h2>

      {/* Progress steps - only show completed and current steps */}
      <div className="w-full max-w-md space-y-2">
        {visibleSteps.map((step, index) => (
          <div 
            key={step.id} 
            className={`flex items-center space-x-2 p-2 rounded-md transition-all duration-500 ease-out ${getStepBackgroundColor(step)}`}
          >
            {/* Step icon */}
            <div className="flex-shrink-0">
              {getStepIcon(step)}
            </div>
            
            {/* Step content */}
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-medium ${getStepTextColor(step)}`}>
                {step.title}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Progress indicator */}
      <div className="w-full max-w-md mt-6">
        <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}