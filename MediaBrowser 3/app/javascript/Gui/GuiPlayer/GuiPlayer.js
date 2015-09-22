//NOTE
//
//Samsung Player accepts seconds
//Samsung Current time works in seconds * 1000
//MediaBrowser3 works in seconds * 10000000

var GuiPlayer = {	
		plugin : null,
		pluginAudio : null,
		pluginScreen : null,
		
		Status : "STOPPED",
		currentTime : 0,
		updateTimeCount : 0,
		setThreeD : false,
		PlayMethod : "",
		videoStartTime : null,
		offsetSeconds : 0, //For transcode, this holds the position the transcode started in the file
		
		playingMediaSource : null,
		playingURL : null,
		playingTranscodeStatus : null,
		playingVideoIndex : null,
		playingAudioIndex : null,
		playingSubtitleIndex : null,
			
		VideoData : null,
		PlayerData : null,
		PlayerDataSubtitle : null,
		PlayerIndex : null,
		
		subtitleInterval : null,
		subtitleShowingIndex : 0,
		subtitleSeeking : false,
		startParams : [],
		
		infoTimer : null
}


GuiPlayer.init = function() {
	GuiMusicPlayer.stopOnAppExit();
	
	this.plugin = document.getElementById("pluginPlayer");
	this.pluginAudio = document.getElementById("pluginObjectAudio");
	this.pluginScreen = document.getElementById("pluginScreen");
	
	//Set up Player
	this.plugin.OnConnectionFailed = 'GuiPlayer.handleConnectionFailed';
	this.plugin.OnAuthenticationFailed = 'GuiPlayer.handleAuthenticationFailed';
	this.plugin.OnNetworkDisconnected = 'GuiPlayer.handleOnNetworkDisconnected';
	this.plugin.OnRenderError = 'GuiPlayer.handleRenderError';
	this.plugin.OnStreamNotFound = 'GuiPlayer.handleStreamNotFound';
	this.plugin.OnRenderingComplete = 'GuiPlayer.handleOnRenderingComplete';
	this.plugin.OnCurrentPlayTime = 'GuiPlayer.setCurrentTime';
    this.plugin.OnBufferingStart = 'GuiPlayer.onBufferingStart';
    this.plugin.OnBufferingProgress = 'GuiPlayer.onBufferingProgress';
    this.plugin.OnBufferingComplete = 'GuiPlayer.onBufferingComplete';  
    this.plugin.OnStreamInfoReady = 'GuiPlayer.OnStreamInfoReady'; 
    this.plugin.SetTotalBufferSize(40*1024*1024);
}

GuiPlayer.start = function(title,url,startingPlaybackTick,playedFromPage) { 
	//Run only once in loading initial request - subsequent vids should go thru the startPlayback
	this.startParams = [title,url,startingPlaybackTick,playedFromPage];
	
	//Display Loading 
	document.getElementById("guiPlayer_Loading").style.visibility = "";

    //Get Item Data (Media Streams)
    this.VideoData = Server.getContent(url);
    if (this.VideoData == null) { return; }
    
    this.PlayerIndex = 0; // Play All  - Default
    if (title == "PlayAll") {
    	if (this.VideoData.TotalRecordCount == 0) {
    		return;
    	}
    	this.PlayerData = this.VideoData.Items[this.PlayerIndex];
    } else {
    	if (this.VideoData.LocationType == "Virtual") {
    		return
    	}
    	this.PlayerData = this.VideoData;
    }

    //Take focus to no input
	document.getElementById("NoKeyInput").focus();
    
	//Load Versions
    GuiPlayer_Versions.start(this.PlayerData,startingPlaybackTick,playedFromPage);
}

GuiPlayer.startPlayback = function(TranscodeAlg, resumeTicksSamsung) {
	//Initiate Player for Video
	this.init();
	FileLog.write("Playback : Player Initialised");
	
	//Turn off Screensaver
    Support.screensaverOff();
	pluginAPI.setOffScreenSaver();  

	//Reset Vars
	this.Status = "STOPPED";
	this.currentTime = 0;
    this.updateTimeCount = 0;
    this.setThreeD = false;
	this.offsetSeconds = 0;
	this.PlayerDataSubtitle = null;
	this.subtitleShowingIndex = 0;
	this.subtitleSeeking = false;
	this.videoStartTime = resumeTicksSamsung;
	
	//Expand TranscodeAlg to useful variables!!!
	this.playingMediaSourceIndex = TranscodeAlg[0];
	this.playingMediaSource = this.PlayerData.MediaSources[TranscodeAlg[0]];
	this.playingURL = TranscodeAlg[1];
	this.playingTranscodeStatus = TranscodeAlg[2];
	this.playingVideoIndex = TranscodeAlg[3];
	this.playingAudioIndex = TranscodeAlg[4];
	this.playingSubtitleIndex = TranscodeAlg[5];
	
	//Set PlayMethod
    this.PlayMethod = (this.playingTranscodeStatus == "Direct Stream") ? "DirectStream" : "Transcode";
    this.playingTranscodeStatus = (this.playingTranscodeStatus == "Direct Stream") ? "Direct Play" : this.playingTranscodeStatus;

    //Set offsetSeconds time
    this.offsetSeconds = (this.PlayMethod == "Transcode") ? resumeTicksSamsung : 0;

    //Set up GuiPlayer_Display
    GuiPlayer_Display.setDisplay(this.PlayerData, this.playingMediaSource, this.playingTranscodeStatus, this.offsetSeconds, this.playingVideoIndex, this.playingAudioIndex, this.playingSubtitleIndex)
    
	//Set Resolution Display
	this.setDisplaySize();
	
	//Subtitles - If resuming find the correct index to start from!
    FileLog.write("Playback : Start Subtitle Processing");
	this.setSubtitles(this.playingSubtitleIndex);
	this.updateSubtitleTime(resumeTicksSamsung,"NewSubs");
	FileLog.write("Playback : End Subtitle Processing");

	//Create Tools Menu
	GuiPlayer_Display.createToolsMenu();
	
	//Update Server content is playing * update time
	Server.videoStarted(this.PlayerData.Id,this.playingMediaSource.Id,this.PlayMethod);
    
	//Update URL with resumeticks
	if (Main.getModelYear() == "D" && this.PlayMethod != "DirectStream") {
		FileLog.write("Playback : D Series Playback OR HTTP - Load URL");
		var url = this.playingURL + '&StartTimeTicks=' + (resumeTicksSamsung*10000) + '|COMPONENT=HLS';
		alert (url);
		var position = Math.round(resumeTicksSamsung / 1000);
	    this.plugin.ResumePlay(url,position); 
	} else {
		FileLog.write("Playback : E+ Series Playback - Load URL");
		var url = this.playingURL + '&StartTimeTicks=' + (resumeTicksSamsung*10000);
		var position = 0; // If transcoding, it takes the &startTimeTick as point 0 in the file
		if (this.PlayMethod == "DirectStream") {
			position = Math.round(resumeTicksSamsung / 1000);
		}	
	    this.plugin.ResumePlay(url,position); 
	}
}

GuiPlayer.stopPlayback = function() {
	FileLog.write("Playback : Stopping");
	this.clearGuiItems();
	this.plugin.Stop();
	this.Status = "STOPPED";
	Server.videoStopped(this.PlayerData.Id,this.playingMediaSource.Id,this.currentTime,this.PlayMethod);
	
	//If D series need to stop HLS Encoding
	if (Main.getModelYear() == "D") {
		Server.stopHLSTranscode();
	}	
}

GuiPlayer.setDisplaySize = function() {
	var aspectRatio = (this.playingMediaSource.MediaStreams[this.playingVideoIndex] === undefined) ? "16:9" : this.playingMediaSource.MediaStreams[this.playingVideoIndex].AspectRatio;
	if (aspectRatio == "16:9") {
		this.plugin.SetDisplayArea(0, 0, 960, 540);
	} else {
		//Scale Video	
		var ratioToShrinkX = 960 / this.playingMediaSource.MediaStreams[this.playingVideoIndex].Width;
		var ratioToShrinkY = 540 / this.playingMediaSource.MediaStreams[this.playingVideoIndex].Height;
			
		if (ratioToShrinkX < ratioToShrinkY) {
			var newResolutionX = 960;
			var newResolutionY = Math.round(this.playingMediaSource.MediaStreams[this.playingVideoIndex].Height * ratioToShrinkX);
			var centering = Math.round((540-newResolutionY)/2);
				
			this.plugin.SetDisplayArea(parseInt(0), parseInt(centering), parseInt(newResolutionX), parseInt(newResolutionY));
		} else {
			var newResolutionX = Math.round(this.playingMediaSource.MediaStreams[this.playingVideoIndex].Width * ratioToShrinkY);
			var newResolutionY = 540;
			var centering = Math.round((960-newResolutionX)/2);
				
			this.plugin.SetDisplayArea(parseInt(centering), parseInt(0), parseInt(newResolutionX), parseInt(newResolutionY));
		}			
	}	
}


GuiPlayer.setSubtitles = function(selectedSubtitleIndex) {
	if (selectedSubtitleIndex > -1) {
		var Stream = this.playingMediaSource.MediaStreams[selectedSubtitleIndex];
		if (Stream.IsTextSubtitleStream) {
			//Set Colour & Size from User Settings
			Support.styleSubtitles("guiPlayer_Subtitles");
			
			var url = Server.getCustomURL("/Videos/"+ this.PlayerData.Id+"/"+this.playingMediaSource.Id+"/Subtitles/"+selectedSubtitleIndex+"/Stream.js?format=json&api_key=" + Server.getAuthToken());
			this.PlayerDataSubtitle = Server.getSubtitles(url);	  
			FileLog.write("Subtitles : loaded "+url);
		    if (this.PlayerDataSubtitle == null) { 
		    	this.playingSubtitleIndex = -1; 
		    	return; 
		    } else {
		    	this.playingSubtitleIndex = selectedSubtitleIndex;
		    }
		    try{
		    	this.PlayerDataSubtitle = JSON.parse(this.PlayerDataSubtitle);
		    }catch(e){
		        alert(e); //error in the above string(in this case,yes)!
		    }
		}
	}
}

GuiPlayer.updateSubtitleTime = function(newTime,direction) {
	if (this.playingSubtitleIndex != -1) {
		//Clear Down Subtitles
		this.subtitleSeeking = true;
		document.getElementById("guiPlayer_Subtitles").innerHTML = "";
		document.getElementById("guiPlayer_Subtitles").style.visibility = "hidden";
		
		if (direction == "FF") {
			if (newTime > this.PlayerDataSubtitle.TrackEvents[this.PlayerDataSubtitle.TrackEvents.length -1].StartPositionTicks / 10000) {
				this.subtitleShowingIndex = this.PlayerDataSubtitle.TrackEvents.length -1;
			} else {
				for (var index = this.subtitleShowingIndex; index < this.PlayerDataSubtitle.TrackEvents.length; index++) {
					if (newTime <= this.PlayerDataSubtitle.TrackEvents[index].StartPositionTicks / 10000) {
						this.subtitleShowingIndex = index;
						break;
					}
				}
			}
		} else if (direction == "RW") {
			FileLog.write(newTime);
			if (newTime < this.PlayerDataSubtitle.TrackEvents[1].StartPositionTicks / 10000) {
				this.subtitleShowingIndex = 1;
			} else {
				for (var index = 1; index <= this.subtitleShowingIndex; index++) {
					if (newTime <= this.PlayerDataSubtitle.TrackEvents[index].StartPositionTicks / 10000) {
						this.subtitleShowingIndex = index -1;
						break;
					}
				}
			}	
		} else {
			this.subtitleShowingIndex = 0;	
			for (var index = 0; index < this.PlayerDataSubtitle.TrackEvents.length; index++) {
				if (newTime <= this.PlayerDataSubtitle.TrackEvents[index].StartPositionTicks / 10000) {
					this.subtitleShowingIndex = index;
					break;
				}
			}	
		}
		this.subtitleSeeking = false;
	}
}


//--------------------------------------------------------------------------------------------------

GuiPlayer.handleOnRenderingComplete = function() {
	GuiPlayer.stopPlayback();
	FileLog.write("Playback : Rendering Complete");
	
	if (this.startParams[0] == "PlayAll") {
	////Call Resume Option - Check playlist first, then AutoPlay property, then return
		this.PlayerIndex++;
		if (this.VideoData.Items.length < this.PlayerIndex) {	
			//Take focus to no input
			document.getElementById("NoKeyInput").focus();
			
			this.PlayerData = this.VideoData.Items[this.PlayerIndex];
			GuiPlayer_Versions.start(this.PlayerData,0,this.startParams[3]);
		} else {
			this.PlayerIndex = 0;
			GuiPlayer_Display.restorePreviousMenu();
		}
	} else if (File.getUserProperty("AutoPlay")){
		if (this.PlayerData.Type == "Episode") {
			this.AdjacentData = Server.getContent(Server.getAdjacentEpisodesURL(this.PlayerData.SeriesId,this.PlayerData.SeasonId,this.PlayerData.Id));
			if (this.AdjacentData == null) { return; }
			
			if (this.AdjacentData.Items.length == 2 && (this.AdjacentData.Items[1].IndexNumber > this.ItemData.IndexNumber)) {
				var url = Server.getItemInfoURL(this.AdjacentData.Items[1].Id);
				//Take focus to no input
				document.getElementById("NoKeyInput").focus();
				this.PlayerData = Server.getContent(url);
				if (this.PlayerData == null) { return; }
				GuiPlayer_Versions.start(this.PlayerData,0,this.startParams[3]);
			} else if (this.AdjacentData.Items.length > 2) {
				//Take focus to no input
				document.getElementById("NoKeyInput").focus();
				var url = Server.getItemInfoURL(this.AdjacentData.Items[2].Id);
				this.PlayerData = Server.getContent(url);
				if (this.PlayerData == null) { return; }
				GuiPlayer_Versions.start(this.PlayerData,0,this.startParams[3]);
			} else {
				GuiPlayer_Display.restorePreviousMenu();
			}
		} else {
			GuiPlayer_Display.restorePreviousMenu();
		}
	} else {
		GuiPlayer_Display.restorePreviousMenu();
	}
}

GuiPlayer.handleOnNetworkDisconnected = function() {
	//Transcoded files throw this error at end of playback?
	FileLog.write("Playback : Network Disconnected");
	GuiNotifications.setNotification(this.playingURL,"NETWORK DISCONNECTED");
	GuiPlayer.stopPlayback();
	GuiPlayer_Display.restorePreviousMenu();
}

GuiPlayer.handleConnectionFailed = function() {
	FileLog.write("Playback : Network Disconnected");
	GuiNotifications.setNotification(this.playingURL,"CONNECTION ERROR");
	GuiPlayer.stopPlayback();
	GuiPlayer_Display.restorePreviousMenu();
}

GuiPlayer.handleAuthenticationFailed = function() {
	FileLog.write("Playback : Authentication Error");
	GuiNotifications.setNotification("AUTHENTICATION ERROR");
	GuiPlayer.stopPlayback();
	GuiPlayer_Display.restorePreviousMenu();
}

GuiPlayer.handleRenderError = function(RenderErrorType) {
	FileLog.write("Playback : Render Error " + RenderErrorType);
    GuiNotifications.setNotification("Rendor Error Type : " + RenderErrorType);
    GuiPlayer.stopPlayback();
    GuiPlayer_Display.restorePreviousMenu();
}

GuiPlayer.handleStreamNotFound = function() {
	FileLog.write("Playback : Stream Not Found");
	GuiNotifications.setNotification("STREAM NOT FOUND");
	GuiPlayer.stopPlayback();
	GuiPlayer_Display.restorePreviousMenu();
}

GuiPlayer.setCurrentTime = function(time) {
	if (this.Status == "PLAYING") {
		this.currentTime = parseInt(time);

		//Subtitle Update
		if (this.playingSubtitleIndex != null && this.PlayerDataSubtitle != null && this.subtitleSeeking == false) {
			if (this.currentTime + this.offsetSeconds >= this.PlayerDataSubtitle.TrackEvents[this.subtitleShowingIndex].EndPositionTicks / 10000) {
				document.getElementById("guiPlayer_Subtitles").innerHTML = "";
				document.getElementById("guiPlayer_Subtitles").style.visibility = "hidden";
				this.subtitleShowingIndex++;
			}
			if (this.currentTime + this.offsetSeconds >= this.PlayerDataSubtitle.TrackEvents[this.subtitleShowingIndex].StartPositionTicks / 10000 && this.currentTime < this.PlayerDataSubtitle.TrackEvents[this.subtitleShowingIndex].EndPositionTicks / 10000 && document.getElementById("guiPlayer_Subtitles").innerHTML != this.PlayerDataSubtitle.text) {
				var subtitleText = this.PlayerDataSubtitle.TrackEvents[this.subtitleShowingIndex].Text; 
				subtitleText = subtitleText.replace(/(^.*)[\r\n|\n\r|\r|\n](.*)/g, '$1<br />$2'); //support two-line subtitles
				document.getElementById("guiPlayer_Subtitles").innerHTML = subtitleText; 
				document.getElementById("guiPlayer_Subtitles").style.visibility = "";
			}
		}
		
		this.updateTimeCount++;
		if (time > 0 && this.setThreeD == false) {
			//Check 3D & Audio
		    //Set Samsung Audio Output between DTS or PCM
		    this.setupAudioConfiguration();
		    this.setupThreeDConfiguration();			
		    this.setThreeD = true;
		}
		
		//Update GUIs
		percentage = (100 * (this.currentTime + this.offsetSeconds) / (this.PlayerData.RunTimeTicks / 10000));

		document.getElementById("guiPlayer_Info_ProgressBar_Current").style.width = percentage + "%";	
		document.getElementById("guiPlayer_Info_Time").innerHTML = Support.convertTicksToTime(this.currentTime+ this.offsetSeconds, (this.PlayerData.RunTimeTicks / 10000));
	
		//Update Server every 8 ticks (Don't want to spam!
		if (this.updateTimeCount == 8) {
			this.updateTimeCount = 0;

			//Update Server
			Server.videoTime(this.PlayerData.Id,this.playingMediaSource.Id,this.currentTime,this.PlayMethod);
		}
	}
}

GuiPlayer.onBufferingStart = function() {
	this.Status = "PLAYING";
	FileLog.write("Playback : Buffering...");
	
	//Show Loading Screen
    document.getElementById("guiPlayer_Loading").style.visibility = "";
	
	//Stop Subtitle Display - Mainly for Transcode pauses
	if (this.playingSubtitleIndex != null) {
		this.subtitleSeeking = true;
	}
}

GuiPlayer.onBufferingProgress = function(percent) {
	FileLog.write("Playback : Buffering " + percent + "%");
}

GuiPlayer.onBufferingComplete = function() {
	FileLog.write("Playback : Buffering Complete");
    
  //Start Subtitle Display - Mainly for Transcode pauses
	if (this.playingSubtitleIndex != null) {
		this.subtitleSeeking = false;
	}
    
    //Hide Loading Screen
    document.getElementById("guiPlayer_Loading").style.visibility = "hidden";
    
	//Setup Volume & Mute Keys
	//Volume & Mute Control - Works!
	NNaviPlugin = document.getElementById("pluginObjectNNavi");
    NNaviPlugin.SetBannerState(PL_NNAVI_STATE_BANNER_VOL);
    pluginAPI.unregistKey(tvKey.KEY_VOL_UP);
    pluginAPI.unregistKey(tvKey.KEY_VOL_DOWN);
    pluginAPI.unregistKey(tvKey.KEY_MUTE);
       
	//Set Focus for Key Events - Must be done on successful load of video
	document.getElementById("GuiPlayer").focus();
}

GuiPlayer.OnStreamInfoReady = function() {
	FileLog.write("Playback : Stream Info Ready");
	document.getElementById("guiPlayer_Info_Time").innerHTML = Support.convertTicksToTime(this.currentTime, (this.PlayerData.RunTimeTicks / 10000));
}

GuiPlayer.clearGuiItems = function() {
	if (this.infoTimer != null){
		clearTimeout(this.infoTimer);
	}
	document.getElementById("guiPlayer_Info").style.visibility="hidden";
	document.getElementById("guiPlayer_ItemDetails").style.visibility="hidden";
	document.getElementById("guiPlayer_ItemDetails2").style.visibility="hidden";
	document.getElementById("guiPlayer_DvdArt").style.visibility="hidden";
	document.getElementById("guiPlayer_Subtitles").innerHTML = "";
	document.getElementById("guiPlayer_Subtitles").style.visibility = "hidden";
}

//-----------------------------------------------------------------------------------------------------------------------------------------
//       GUIPLAYER PLAYBACK KEY HANDLERS
//-----------------------------------------------------------------------------------------------------------------------------------------

GuiPlayer.keyDown = function() {
	var keyCode = event.keyCode;

	switch(keyCode) {
		case tvKey.KEY_RETURN:
			FileLog.write("Playback : Return By User");
			widgetAPI.blockNavigation(event);
			this.stopPlayback();
            GuiPlayer_Display.restorePreviousMenu();
			break;	
		case tvKey.KEY_RIGHT:
			this.handleRightKey();
			break;
		case tvKey.KEY_LEFT:
			this.handleLeftKey();
			break;		
		case tvKey.KEY_PLAY:
			this.handlePlayKey();
			break;
		case tvKey.KEY_STOP:
			this.handleStopKey();
            break;
		case tvKey.KEY_PAUSE:
			this.handlePauseKey();
            break;   
        case tvKey.KEY_FF:
            this.handleFFKey();      
            break;       
        case tvKey.KEY_RW:
            this.handleRWKey();
            break;
        case tvKey.KEY_INFO:	
			GuiPlayer.handleInfoKey();
			break;
        case tvKey.KEY_3D:	
        	GuiPlayer.setupThreeDConfiguration();
			break;	
        case tvKey.KEY_TOOLS:
        	if (document.getElementById("guiPlayer_Tools").style.visibility == "hidden") {
        		document.getElementById("guiPlayer_Info").style.visibility="hidden";
        		document.getElementById("guiPlayer_ItemDetails").style.visibility="hidden";
        		document.getElementById("guiPlayer_ItemDetails2").style.visibility="hidden";
        		document.getElementById("guiPlayer_DvdArt").style.visibility="hidden";
        		GuiPlayer_Display.updateSelectedItems();
        		document.getElementById("guiPlayer_Tools").style.visibility = "";
        		document.getElementById("GuiPlayer_Tools").focus();
        	}
        	break;
        case tvKey.KEY_EXIT:
        	FileLog.write("EXIT KEY");
            widgetAPI.blockNavigation(event);
            this.stopPlayback();
            GuiPlayer_Display.restorePreviousMenu();
            break;	
	}
}

GuiPlayer.handleRightKey = function() {
	if (this.startParams[0] == "PlayAll") {
		this.PlayerIndex++;
		if (this.VideoData.Items.length > this.PlayerIndex) {	
			this.stopPlayback();
			this.PlayerData = this.VideoData.Items[this.PlayerIndex];
			GuiPlayer_Versions.start(this.PlayerData,0,this.startParams[3]);
		} else {
			//Reset PlayerData to correct index!!
			this.PlayerIndex--;
			this.PlayerData = this.VideoData.Items[this.PlayerIndex];
		}
	}
}

GuiPlayer.handleLeftKey = function() {
	if (this.startParams[0] == "PlayAll") {
		this.PlayerIndex--;
		if (this.PlayerIndex >= 0) {	
			this.stopPlayback();
			this.PlayerData = this.VideoData.Items[this.PlayerIndex];
			GuiPlayer_Versions.start(this.PlayerData,0,this.startParams[3]);
		} else {
			//Reset PlayerData to correct index!!
			this.PlayerIndex++;
			this.PlayerData = this.VideoData.Items[this.PlayerIndex];
		}
	}
}

GuiPlayer.handlePlayKey = function() {
	if (this.Status == "PAUSED") {
		FileLog.write("Playback : Play by User");
		this.Status = "PLAYING";
		this.plugin.Resume();
		document.getElementById("guiPlayer_Subtitles").className="videoSubtitles2";
		document.getElementById("guiPlayer_Info").style.visibility="";
		document.getElementById("guiPlayer_ItemDetails").style.visibility="hidden";
		document.getElementById("guiPlayer_ItemDetails2").style.visibility="";
		document.getElementById("guiPlayer_DvdArt").style.visibility="";
		Support.clock();
		if (this.infoTimer != null){
			clearTimeout(this.infoTimer);
		}
		this.infoTimer = setTimeout(function(){
			document.getElementById("guiPlayer_Subtitles").className="videoSubtitles1";
			document.getElementById("guiPlayer_Info").style.visibility="hidden";
			document.getElementById("guiPlayer_ItemDetails2").style.visibility="hidden";
			document.getElementById("guiPlayer_DvdArt").style.visibility="hidden";
		}, 3000);
	}
	else
	{
		document.getElementById("guiPlayer_Subtitles").className="videoSubtitles2";
		document.getElementById("guiPlayer_Info").style.visibility="";
		document.getElementById("guiPlayer_ItemDetails").style.visibility="hidden";
		document.getElementById("guiPlayer_ItemDetails2").style.visibility="";
		document.getElementById("guiPlayer_DvdArt").style.visibility="";
		if (this.infoTimer != null){
			clearTimeout(this.infoTimer);
		}
		this.infoTimer = setTimeout(function(){
			document.getElementById("guiPlayer_Subtitles").className="videoSubtitles1";
			document.getElementById("guiPlayer_Info").style.visibility="hidden";
			document.getElementById("guiPlayer_ItemDetails2").style.visibility="hidden";
			document.getElementById("guiPlayer_DvdArt").style.visibility="hidden";
		}, 3000);
	}
}

GuiPlayer.handleStopKey = function() {
    FileLog.write("Playback : Stopped by User");
    this.stopPlayback();
    GuiPlayer_Display.restorePreviousMenu();
}

GuiPlayer.handlePauseKey = function() {
	if(this.Status == "PLAYING") {	
		document.getElementById("guiPlayer_Subtitles").className="videoSubtitles2";
		document.getElementById("guiPlayer_Info").style.visibility="";
		document.getElementById("guiPlayer_ItemDetails").style.visibility="hidden";
		document.getElementById("guiPlayer_ItemDetails2").style.visibility="";
		document.getElementById("guiPlayer_DvdArt").style.visibility="";
		FileLog.write("Playback : Paused by User");
		this.plugin.Pause();
		this.Status = "PAUSED";
		Server.videoPaused(this.PlayerData.Id,this.playingMediaSource.Id,this.currentTime,this.PlayMethod);   
		if (this.infoTimer != null){
			clearTimeout(this.infoTimer);
		}
		this.infoTimer = setTimeout(function(){
			document.getElementById("guiPlayer_Subtitles").className="videoSubtitles1";
			document.getElementById("guiPlayer_Info").style.visibility="hidden";
			document.getElementById("guiPlayer_ItemDetails2").style.visibility="hidden";
			document.getElementById("guiPlayer_DvdArt").style.visibility="hidden";
		}, 6000);
	} 
}

GuiPlayer.handleFFKey = function() {
	FileLog.write("Playback : Fast Forward");
    if(this.Status == "PLAYING") {
    	if (this.PlayMethod == "DirectStream") {
    		document.getElementById("guiPlayer_Subtitles").className="videoSubtitles2";
    		document.getElementById("guiPlayer_Info").style.visibility="";
    		document.getElementById("guiPlayer_ItemDetails").style.visibility="hidden";
    		document.getElementById("guiPlayer_ItemDetails2").style.visibility="";
    		document.getElementById("guiPlayer_DvdArt").style.visibility="";
    		FileLog.write("Playback : Fast Forward : Direct Stream");
    		GuiPlayer.updateSubtitleTime(this.currentTime + 29000,"FF"); //Add 29 seconds on, let code find correct sub!
        	this.plugin.JumpForward(30); 
    		if (this.infoTimer != null){
    			clearTimeout(this.infoTimer);
    		}
        	this.infoTimer = setTimeout(function(){
    			document.getElementById("guiPlayer_Subtitles").className="videoSubtitles1";
    			document.getElementById("guiPlayer_Info").style.visibility="hidden";
    			document.getElementById("guiPlayer_ItemDetails2").style.visibility="hidden";
    			document.getElementById("guiPlayer_DvdArt").style.visibility="hidden";
    		}, 3000);
    	} else {
    		/*
    		var canSkip = this.checkTranscodeCanSkip(this.currentTime + 30000);
    		if (canSkip == true) {
    			FileLog.write("Playback : Fast Forward : Transcode : Transcoded already, can skip");
    			GuiPlayer.updateSubtitleTime(this.currentTime + 29000,"FF"); //Add 29 seconds on, let code find correct sub!
            	this.plugin.JumpForward(30); 
    		} else {
    			FileLog.write("Playback : Fast Forward : Transcode : Not Transcoded already, reset");
    			this.newPlaybackPosition((this.currentTime+this.offsetSeconds + 30000)*1000)
    		}
    		*/
    	}
    }  
}

GuiPlayer.handleRWKey = function() {
	FileLog.write("Playback : Fast Forward");
    if(this.Status == "PLAYING") {
    	if (this.PlayMethod == "DirectStream") {
    		document.getElementById("guiPlayer_Subtitles").className="videoSubtitles2";
    		document.getElementById("guiPlayer_Info").style.visibility="";
    		document.getElementById("guiPlayer_ItemDetails").style.visibility="hidden";
    		document.getElementById("guiPlayer_ItemDetails2").style.visibility="";
    		document.getElementById("guiPlayer_DvdArt").style.visibility="";
    		FileLog.write("Playback : Rewind : Direct Stream");
    		GuiPlayer.updateSubtitleTime(this.currentTime - 33000,"RW"); //Subtract 33 seconds on, let code find correct sub!
    		this.plugin.JumpBackward(30); 
    		if (this.infoTimer != null){
    			clearTimeout(this.infoTimer);
    		}
    		this.infoTimer = setTimeout(function(){
    			document.getElementById("guiPlayer_Subtitles").className="videoSubtitles1";
    			document.getElementById("guiPlayer_Info").style.visibility="hidden";
    			document.getElementById("guiPlayer_ItemDetails2").style.visibility="hidden";
    			document.getElementById("guiPlayer_DvdArt").style.visibility="hidden";
    		}, 3000);
    	} else {
    		/*
    		var canSkip = this.checkTranscodeCanSkip(this.currentTime - 30000);
    		if (canSkip == true) {
    			FileLog.write("Playback : Rewind : Transcode : Transcoded already, can skip");
    			GuiPlayer.updateSubtitleTime(this.currentTime - 33000,"RW"); //Subtract 33 seconds on, let code find correct sub!
            	this.plugin.JumpBackward(30); 
    		} else {
    			FileLog.write("Playback : Rewind : Transcode : Not Transcoded already, reset");
    			this.newPlaybackPosition((this.currentTime+this.offsetSeconds - 30000)*1000)
    		}
    		*/
    	}
    }  
}

GuiPlayer.handleInfoKey = function () {
	//If subtitles are showing - shift them above the info pane.
	if (document.getElementById("guiPlayer_ItemDetails").style.visibility=="hidden"){
		document.getElementById("guiPlayer_Subtitles").className="videoSubtitles2";		
		document.getElementById("guiPlayer_Info").style.visibility="";
		document.getElementById("guiPlayer_ItemDetails").style.visibility="";
		document.getElementById("guiPlayer_ItemDetails2").style.visibility="hidden";
		document.getElementById("guiPlayer_DvdArt").style.visibility="hidden";
		if (this.infoTimer != null){
			clearTimeout(this.infoTimer);
		}
		this.infoTimer = setTimeout(function(){
			document.getElementById("guiPlayer_Subtitles").className="videoSubtitles1";		
			document.getElementById("guiPlayer_Info").style.visibility="hidden";
			document.getElementById("guiPlayer_ItemDetails").style.visibility="hidden";
		}, 10000);
	} else {
		document.getElementById("guiPlayer_Subtitles").className="videoSubtitles1";
		document.getElementById("guiPlayer_ItemDetails").style.visibility="hidden";
		document.getElementById("guiPlayer_Info").style.visibility="hidden";	
		if (this.infoTimer != null){
			clearTimeout(this.infoTimer);
		}
	}
}

//-----------------------------------------------------------------------------------------------------------------------------------------
//       GUIPLAYER 3D & AUDIO OUTPUT SETTERS
//-----------------------------------------------------------------------------------------------------------------------------------------

GuiPlayer.setupThreeDConfiguration = function() {
	if (this.playingMediaSource.Video3DFormat !== undefined) {
		if (this.pluginScreen.Flag3DEffectSupport()) {
			switch (this.playingMediaSource.Video3DFormat) {
			case "FullSideBySide":
			case "HalfSideBySide":
				result = GuiPlayer.pluginScreen.Set3DEffectMode(2);
			break;
			default:
				this.pluginScreen.Set3DEffectMode(0);
				break;
			}
		} else {
			this.pluginScreen.Set3DEffectMode(0);
		}
	} else {
		this.pluginScreen.Set3DEffectMode(0);
	}
}

GuiPlayer.setupAudioConfiguration = function() {

	var audioInfoStream = this.playingMediaSource.MediaStreams[this.playingAudioIndex];
	var codec = audioInfoStream.Codec.toLowerCase();
	
	//If audio has been transcoded need to manually set codec as codec in stream info will be wrong
	if ((File.getTVProperty("Dolby") && File.getTVProperty("AACtoDolby")) && audioInfoStream.Codec.toLowerCase() == "aac") {
		codec = "ac3";
	}

	switch (codec) {
	case "dca":
		if (File.getTVProperty("DTS")){
			var checkAudioOutModeDTS = this.pluginAudio.CheckExternalOutMode(2);
			if (checkAudioOutModeDTS > 0) {
				this.pluginAudio.SetExternalOutMode(2);
			} else {
				this.pluginAudio.SetExternalOutMode(0);
			}
			
		} else {
			this.pluginAudio.SetExternalOutMode(0);
		}
		break;	
	case "ac3":
		if (File.getTVProperty("Dolby")) {
			var checkAudioOutModeDolby = this.pluginAudio.CheckExternalOutMode(1);
			if (checkAudioOutModeDolby > 0) {
				this.pluginAudio.SetExternalOutMode(1);
			} else {
				this.pluginAudio.SetExternalOutMode(0);
			}	
		}else {
			this.pluginAudio.SetExternalOutMode(0);
		}
		break;
	default:
		this.pluginAudio.SetExternalOutMode(0);
		break;
	}
};

GuiPlayer.getTranscodeProgress = function() {
	//Get Session Data (Media Streams)
    var SessionData = Server.getContent(Server.getCustomURL("/Sessions?format=json"));
    if (SessionData == null) { return; }
    
    for (var index = 0; index < SessionData.length; index++) {
    	if (SessionData[index].DeviceId == Server.getDeviceID()) {
    		return Math.floor(SessionData[index].TranscodingInfo.CompletionPercentage);
    	}
    }
    return null;  
}

GuiPlayer.checkTranscodeCanSkip = function(newtime) {	
	var transcodePosition = (transcodeProgress / 100) * ((this.PlayerData.RunTimeTicks / 10000) - this.offsetSeconds)
	if ((newtime > this.offsetSeconds) && newtime < transcodePosition) {
		return true;
	} else {
		return false;
	}
	
}

GuiPlayer.newPlaybackPosition = function(startPositionTicks) {
	document.getElementById("NoKeyInput").focus();		
	this.stopPlayback();
	//Update URL with resumeticks
	this.setDisplaySize();
	var position = Math.round(startPositionTicks / 10000000);
	if (Main.getModelYear() == "D" && this.PlayMethod != "DirectStream") {
		var url = this.playingURL + '&StartTimeTicks=' + (Math.round(startPositionTicks)) + '|COMPONENT=HLS';						
	    this.plugin.ResumePlay(url,0); //0 as if transcoding the transcode will start from the supplied starttimeticks
	    this.updateSubtitleTime(startPositionTicks / 10000,"NewSubs");
	} else {
		var url = this.playingURL + '&StartTimeTicks=' + (Math.round(startPositionTicks));
		
		if (this.PlayMethod != "DirectStream") {
			this.plugin.ResumePlay(url,0); //0 as if transcoding the transcode will start from the supplied starttimeticks
		} else {
			this.plugin.ResumePlay(url,position); 
		}    
	    this.updateSubtitleTime(startPositionTicks / 10000,"NewSubs");
	}
}

GuiPlayer.newSubtitleIndex = function (newSubtitleIndex) {
	if (newSubtitleIndex == -1 && this.playingSubtitleIndex != null) {
		//Turn Off Subtitles
		this.PlayerDataSubtitle = null;
		this.playingSubtitleIndex = -1;
		this.subtitleShowingIndex = 0;
		this.subtitleSeeking = false;
		document.getElementById("guiPlayer_Subtitles").innerHTML = "";
		document.getElementById("guiPlayer_Subtitles").style.visibility = "hidden";
		document.getElementById("GuiPlayer").focus();	
	} else {
		//Check its not already selected 
		if (newSubtitleIndex != this.playingSubtitleIndex) {
			//Prevent displaying Subs while loading
			this.subtitleSeeking = true; 
			document.getElementById("guiPlayer_Subtitles").innerHTML = "";
			document.getElementById("guiPlayer_Subtitles").style.visibility = "hidden";
			
			//Update SubtitleIndex and reset index
			this.playingSubtitleIndex = newSubtitleIndex;
			
			//Load New Subtitle File
			this.setSubtitles(this.playingSubtitleIndex);
		    
		    //Update subs index
		    this.updateSubtitleTime(this.currentTime,"NewSubs");
		    
		    //Load Back to main page GUI
		    document.getElementById("GuiPlayer").focus();
		} else {
			//Do Nothing!
			document.getElementById("GuiPlayer").focus();
		}		
	}
	//Keep the Subtitles menu up to date with the currently playing subs.
	GuiPlayer_Display.playingSubtitleIndex = this.playingSubtitleIndex;
}

//-----------------------------------------------------------------------------------------------------------------------------------------
//       GUIPLAYER STOP HANDLER ON APP EXIT
//-----------------------------------------------------------------------------------------------------------------------------------------

GuiPlayer.stopOnAppExit = function() {
	if (this.plugin != null) {
		this.plugin.Stop();
		this.plugin = null;
	}
}

