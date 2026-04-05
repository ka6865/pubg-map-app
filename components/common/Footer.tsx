"use client";

import React from "react";

const Footer = () => {
  return (
    <footer className="w-full bg-[#121212] border-t border-[#333] py-4 px-4 mt-auto">
      <div className="max-w-[1200px] mx-auto flex flex-col items-center text-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[#F2A900] font-bold text-lg tracking-wider italic">BGMS</span>
        </div>
        
        <p className="text-[#666] text-[11px] leading-tight max-w-[800px]">
          BGMS는 배틀그라운드 팬들을 위한 비공식 서비스이며, KRAFTON 및 PUBG Corporation과 제휴 관계가 아닙니다. <br className="hidden md:block" />
          BGMS is an unofficial fan-made service and is not affiliated with KRAFTON or PUBG Corporation.
        </p>
        
        <div className="text-[#444] text-[9px]">
          &copy; {new Date().getFullYear()} BGMS Team. All Rights Reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
