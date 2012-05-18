var ew_BundleTasksTreeView = {
    COLNAMES: [
        'bun.id',
        'bun.instanceId',
        'bun.state',
        'bun.startTime',
        'bun.updateTime',
        'bun.s3bucket',
        'bun.s3prefix',
        'bun.errorMsg'
    ],
    treeBox: null,
    selection: null,
    selectedBundleId: null,
    taskList : new Array(),
    registered : false,
    bundleIdRegex : new RegExp("^bun-"),

    get rowCount() { return this.taskList.length; },

    setTree     : function(treeBox)     { this.treeBox = treeBox; },
    getCellText : function(idx, column) {
        if (idx >= this.rowCount) return "";
        var member = column.id.slice(column.id.indexOf(".")+1);
        return this.taskList[idx][member];
    },

    getCellProperties : function(row, col, props) {
        var shortName = col.id.split(".").pop();
        if (shortName == "state") {
            var stateName = this.taskList[row].state.replace('-','_').toLowerCase();
            var aserv = Components.classes["@mozilla.org/atom-service;1"].getService(Components.interfaces.nsIAtomService);
            props.AppendElement(aserv.getAtom("instance_"+stateName));
        }
    },

    isEditable: function(idx, column)  { return true; },
    isContainer: function(idx)         { return false;},
    isSeparator: function(idx)         { return false; },
    isSorted: function()               { return false; },

    getImageSrc: function(idx, column) { return ""; },
    getProgressMode : function(idx,column) {},
    getCellValue: function(idx, column) {},
    cycleHeader: function(col) {
        var task = this.getSelectedBundle();
        cycleHeader(
            col,
            document,
            this.COLNAMES,
            this.taskList);
        this.treeBox.invalidate();
        if (task) {
            this.selectByBundleId(task.id);
        }
    },

    enableOrDisableItems  : function (event) {
        var task = this.getSelectedBundle();

        if (task == null) {
            return;
        }

        var fDisabled = (task.state == "complete" || task.state == "failed");

        // If the task has been completed or has failed, disable the
        // following context menu items.
        document.getElementById("bundleTasks.context.cancel").disabled = fDisabled;

        // If the task hasn't completed, you can't register a new AMI
        fDisabled = (task.state != "complete");
        document.getElementById("bundleTasks.context.register").disabled = fDisabled;
    },

    getSearchText: function() {
        return document.getElementById('ew.bundleTasks.search').value;
    },

    startRefreshTimer : function() {
        log("Starting Refresh Timer");
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        ew_session.addTabToRefreshList("ew_BundleTasksTreeView");
        // Set the UI up to refresh every 10 seconds
        this.refreshTimer = setTimeout(ew_BundleTasksTreeView.refresh, 10*1000);
    },

    stopRefreshTimer : function() {
        log("Stopping Refresh Timer");
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            ew_session.removeTabFromRefreshList("ew_BundleTasksTreeView");
        }
    },

    searchChanged : function(event) {
        if (this.searchTimer) {
            clearTimeout(this.searchTimer);
        }

        this.searchTimer = setTimeout(this.invalidate, 500);
    },

    register: function() {
        if (!this.registered) {
            this.registered = true;
            ew_model.registerInterest(this, 'bundleTasks');
        }
    },

    refresh : function() {
        ew_session.controller.describeBundleTasks();
    },

    invalidate: function() {
        var me = ew_BundleTasksTreeView;
        me.displayBundleTasks(me.filterTasks(ew_session.model.bundleTasks));
    },

    notifyModelChanged: function(interest) {
        this.invalidate();
    },

    sort : function() {
        this.selectionChanged();
        sortView(document, this.COLNAMES, this.taskList);
        this.selectByBundleId(this.selectedBundleId);
    },

    selectByBundleId  : function(id) {
        if (id == null) return;
        this.selection.clearSelection();

        for(var i in this.taskList) {
            if (this.taskList[i].id == id) {
                this.selection.toggleSelect(i);
                this.treeBox.ensureRowIsVisible(i);
                return;
            }
        }
    },

    selectionChanged : function(event) {
        // preserve the id of the selected task
        // so we can reselect it later on
        var selected = this.getSelectedBundle();
        if (selected) {
            this.selectedBundleId = selected.id;
        }
    },

    cycleCell: function(idx, column) {},
    performAction: function(action) {},
    performActionOnCell: function(action, index, column) {},
    getRowProperties: function(idx, column, prop) {},
    getColumnProperties: function(column, element, prop) {},
    getLevel : function(idx) { return 0; },

    getSelectedBundle : function() {
        var index =  this.selection.currentIndex;
        if (index == -1) return null;
        return this.taskList[index];
    },

    viewDetails : function(event) {
        var task = this.getSelectedBundle();

        if (task == null) {
            return;
        }

        window.openDialog("chrome://ew/content/dialog_bundle_task_details.xul", null, "chrome,centerscreen,modal,resizable", task);
    },

    pendingBundleTasks : function() {
        // Walk the list of bundle tasks to see whether there is a task
        // whose state needs to be refreshed
        var tasks = ew_session.model.bundleTasks;
        var fPending = false;

        for (var i in tasks) {
            if (tasks[i].state == "complete" ||
                tasks[i].state == "failed") {
                continue;
            }

            fPending = true;
            break;
        }

        return fPending;
    },

    displayBundleTasks : function (taskList) {
        this.treeBox.rowCountChanged(0, -this.taskList.length);
        this.taskList = taskList || [];
        this.treeBox.rowCountChanged(0, this.taskList.length);
        this.sort();
        // reselect old selection
        if (this.selectedBundleId) {
            this.selectByBundleId(this.selectedBundleId);
        } else {
            this.selection.clearSelection();
        }

        // Determine if there are any pending bundle tasks
        if (this.pendingBundleTasks()) {
            this.startRefreshTimer();
        } else {
            this.stopRefreshTimer();
        }
    },

    cancelBundleTask: function () {
        var selected = this.getSelectedBundle();
        if (selected == null) {
            return;
        }

        var confirmed = confirm("Cancel bundle task:  " + selected.id + "?");
        if (!confirmed)
            return;

        var me = this;
        var wrap = function() {
            me.refresh();
            me.selectByBundleId();
        }

        ew_session.controller.cancelBundleTask(selected.id, wrap);
    },

    copyToClipBoard : function(fieldName) {
        var selected = this.getSelectedBundle();
        if (selected == null) return;

        copyToClipboard(selected[fieldName]);
    },

    filterTasks : function (taskList) {
        var searchText = this.getSearchText().toLowerCase();
        if (searchText.length == 0)
            return taskList;

        var newList = new Array();
        for(var i in taskList) {

            if (taskList[i].id.match(this.bundleIdRegex) &&
                this.taskMatchesSearch(taskList[i], searchText)) {
               newList.push(taskList[i]);
            }
        }
        return newList;
    },

    taskMatchesSearch : function(task, searchText) {
        if (!searchText || (searchText.length == 0)) return true;

        for (var i = 0; i < this.COLNAMES.length; i++) {
            var text = this.getTaskDetail(task, this.COLNAMES[i]);
            if (text && (text.toLowerCase().indexOf(searchText) > -1)) {
                return true;
            }
        }

        return false;
    },

    getTaskDetail : function(task, column) {
        var shortName = column.split(".").pop();
        return task[shortName];
    },

    registerBundledImage : function (bucket, prefix) {
        var manifestPath = bucket + "/" + prefix + ".manifest.xml";
        var wrap = function(x) {
            ew_AMIsTreeView.refresh();
            ew_AMIsTreeView.selectByImageId(x);
            // Navigate to the AMIs tab
            ew_session.selectTab('ew.tabs.image');
        }
        var region = ew_session.controller.getS3BucketLocation(bucket);
        ew_session.controller.registerImageInRegion(manifestPath,
                                                       region,
                                                       wrap);
    },

    registerNewImage : function () {
        var selected = this.getSelectedBundle();

        if (selected == null) return;

        // Ensure that bundling has run to completion
        if (selected.state != "complete") {
            alert('Please wait for the Bundling State to be "complete" before Registering');
            return;
        }

        this.registerBundledImage(selected.s3bucket, selected.s3prefix);
    },
};

ew_BundleTasksTreeView.register();
