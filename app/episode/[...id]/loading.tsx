'use client'

import React from 'react';

export default function Loading() {
  return (
    <div className="w-full  p-4 animate-pulse">
      {/* 标题骨架 */}
      <div className="h-8 bg-gray-200 rounded-md w-3/4 mb-6"></div>
      
      {/* 播客信息区域 */}
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        {/* 图片骨架 */}
        <div className="w-60 h-60 bg-gray-200 rounded-md"></div>
        
        {/* 内容骨架 */}
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded-md w-1/2 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded-md w-1/3 mb-6"></div>
          
          {/* 描述骨架 */}
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded-md w-full"></div>
            <div className="h-3 bg-gray-200 rounded-md w-full"></div>
            <div className="h-3 bg-gray-200 rounded-md w-5/6"></div>
            <div className="h-3 bg-gray-200 rounded-md w-3/4"></div>
          </div>
          
          {/* 按钮骨架 */}
          <div className="mt-6 flex gap-3">
            <div className="h-10 bg-gray-200 rounded-md w-32"></div>
            <div className="h-10 bg-gray-200 rounded-md w-32"></div>
          </div>
        </div>
      </div>
      
      {/* 内容区域骨架 */}
      <div className="space-y-4 mt-8">
        <div className="h-6 bg-gray-200 rounded-md w-1/4 mb-4"></div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded-md w-full"></div>
          <div className="h-3 bg-gray-200 rounded-md w-full"></div>
          <div className="h-3 bg-gray-200 rounded-md w-full"></div>
          <div className="h-3 bg-gray-200 rounded-md w-5/6"></div>
          <div className="h-3 bg-gray-200 rounded-md w-full"></div>
          <div className="h-3 bg-gray-200 rounded-md w-3/4"></div>
        </div>
      </div>
    </div>
  );
}