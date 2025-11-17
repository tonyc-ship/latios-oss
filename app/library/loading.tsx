'use client'

import React from 'react';

export default function Loading() {
  return (
    <div className="container mx-auto py-8 animate-pulse">
      {/* Podcast 区域 */}
      <div className="mb-10">
        <div className="flex justify-between items-center mb-4">
          <div className="h-7 bg-gray-200 rounded-md w-32"></div>
        </div>
        
        {/* Podcast 骨架列表 */}
        <div className="flex gap-6 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex flex-col items-center min-w-max">
              <div className="w-20 h-20 rounded-full bg-gray-200"></div>
              <div className="h-4 bg-gray-200 rounded w-16 mt-2"></div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Episodes 区域 */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div className="h-7 bg-gray-200 rounded-md w-48"></div>
        </div>
        
        {/* Episodes 骨架列表 */}
        <div className="bg-white rounded-lg shadow">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="p-4 border-b border-gray-100">
              <div className="flex mb-2">
                <div className="w-16 h-16 rounded bg-gray-200 mr-4"></div>
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </div>
              </div>
              <div className="space-y-2 mt-2">
                <div className="h-3 bg-gray-200 rounded w-full"></div>
                <div className="h-3 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}