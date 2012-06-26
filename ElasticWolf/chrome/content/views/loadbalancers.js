var ew_LoadbalancerTreeView = {
    model: [ "loadBalancers", "availabilityZones", "instances","cerverCerts", "elbPolicyTypes" ],

    display: function(list)
    {
        TreeView.display.call(this, list);
        if (!list || !list.length) {
            ew_InstanceHealthTreeView.display([]);
        }
    },

    selectionChanged : function() {
        var elb = this.getSelected();
        if (!elb) return;
        if (elb.InstanceHealth) {
            ew_InstanceHealthTreeView.display(elb.InstanceHealth);
        } else {
            this.core.api.describeInstanceHealth(elb.name, function(list) { ew_InstanceHealthTreeView.display(list); });
        }
    },

    deleteLoadBalancer : function(){
        var elb = this.getSelected();
        if (elb == null) return;
        if (!confirm("Delete Loadbalancer "+elb.name+"?")) return;
        var me = this;
        this.core.api.deleteLoadBalancer(elb.name, function () { me.refresh() });
    },

    create: function() {
        var tab = this.core.getCurrentTab();
        var retVal = {ok:null, vpc: tab && tab.name.match("vpc") };
        window.openDialog("chrome://ew/content/dialogs/create_loadbalancer.xul",null,"chrome,centerscreen,modal,resizable",ew_core,retVal);
        var me = this;
        if (retVal.ok) {
            this.core.api.createLoadBalancer(retVal.name,retVal.Protocol,retVal.elbport,retVal.instanceport,retVal.Zone,retVal.subnetId,retVal.groups, function() {
                this.core.api.configureHealthCheck(retVal.name,retVal.Target,retVal.Interval,retVal.Timeout,retVal.HealthyThreshold,retVal.UnhealthyThreshold, function() {
                    if (retVal.instances.length > 0) {
                        this.core.api.registerInstancesWithLoadBalancer(retVal.name, retVal.instances, function() { me.refresh() });
                    } else {
                        me.refresh();
                    }
                });
            });
        }
     },

     createListener: function() {
         var elb = this.getSelected();
         if (elb == null) return;
         var certs = this.core.queryModel('serverCerts');
         var inputs = [{label:"Load Balancer",type:"label",value:elb.name,bold:1},
                       {label:"Instance Port:",type:"number",required:1},
                       {label:"Instance Protocol:",type:"menulist",required:1,list:["HTTP","HTTPS","TCP","SSL"]},
                       {label:"LoadBalancer Port:",type:"number",required:1},
                       {label:"LoadBalancer Protocol:",type:"menulist",required:1,list:["HTTP","HTTPS","TCP","SSL"]},
                       {label:"SSL Certificate",type:"menulist",list:certs,required:1}]

         var values = this.core.promptInput('Create Listener', [, ]);
         if (!values) return;
         var me = this;
         this.core.api.createLoadBalancerListeners(elb.name,values[1],values[2],values[3],values[4],values[5],function() { me.refresh(); });
     },

     configureHealthCheck: function() {
        var elb = this.getSelected();
        if (elb == null) return;
        var inputs = [{label:"Load Balancer",type:"label",value:elb.name,bold:1},
                      {label:"Target",size:45,required:1},
                      {label:"Interval",type:"number",help:"seconds",required:1},
                      {label:"Timeout",type:"number", help:"seconds",required:1},
                      {label:"Healthy Threshold",type:"number",required:1},
                      {label:"Unhealthy Threhold",type:"number",required:1}]

        var values = this.core.promptInput("Configure HealthCheck", inputs);
        if (!values) return;
        var me = this;
        this.core.api.configureHealthCheck(elb.name,values[1],values[2],values[3],values[4],values[5],function() { me.refresh(); });
    },

    registerinstances : function(){
        var elb = this.getSelected();
        if (elb == null) return;
        var instances = [];
        if (elb.vpcId) {
            instances = this.core.queryModel('instances', 'state', 'running', 'vpcId', elb.vpcId);
        } else {
            instances = this.core.queryModel('instances', 'state', 'running');
        }
        var list = this.core.promptList('Register Instances', 'Select instances to register with this load balancer:', instances, null, null, true);
        if (!list || !list.length) return;
        var me = this;
        instances = []
        for (var i in list) {
            instances.push(list[i].id)
        }
        this.core.api.registerInstancesWithLoadBalancer(elb.name, instances, function() { me.refresh() });
    },

    deregisterinstances : function(){
        var elb = this.getSelected();
        if (elb == null) return;
        var instances = [];
        for (var  i in elb.Instances) {
            instances.push(this.core.findModel('instances', elb.Instances[i]))
        }
        var list = this.core.promptList('Deregister Instances', 'Select instances to deregister with this load balancer:', instances, null, null, true);
        if (!list || !list.length) return;
        var me = this;
        instances = []
        for (var i in list) {
            instances.push(list[i].id)
        }
        this.core.api.deregisterInstancesWithLoadBalancer(elb.name, instances, function() { me.refresh() });
    },

    manageZones : function(enable) {
        var elb = this.getSelected();
        if (elb == null) return;
        var zones = this.core.queryModel('availabilityZones');
        var checked = [];
        if (enable) {
            for (var i in zones) {
                if (elb.zones.indexOf(zones[i].name) >= 0) {
                    checked.push(zones[i]);
                }
            }
        }
        var list = this.core.promptList((enable ? "Enable" : "Disable") + 'Availability Zones', 'Select Zones to ' + (enable ? "enable" : "disable") + ' for this load balancer:', zones, null, null, true, checked);
        if (!list || !list.length) return;
        var zonelist = []
        for (var i in list) {
            zonelist.push(list[i].name);
        }
        var me = this;
        if (enable) {
            this.core.api.enableAvailabilityZonesForLoadBalancer(elb.name, zonelist, function() { me.refresh() });
        } else {
            this.core.api.disableAvailabilityZonesForLoadBalancer(elb.name, zonelist, function() { me.refresh() });
        }
    },

    setSSLCertificate : function(enable) {
        var elb = this.getSelected();
        if (elb == null) return;
        var certs = this.core.queryModel('serverCerts');
        if (!certs.length) {
            if (confirm("There are no server certificates, do you want to create one now?")) {
                ew_ServerCertsTreeView.createCert();
                return;
            }
        }
        var values = this.core.promptInput('Server Certificates', [{label:"LoadBalancer Port:",type:"number",required:1}, {label:"Certificate",type:"menulist",list:certs,required:1}]);
        if (!values) return;
        var me = this;
        this.core.api.setLoadBalancerListenerSSLCertificate(elb.name, values[0], values[1], function() { me.refresh() });
    },

    disablestickness :function(){
        var elb = this.getSelected();
        if (elb == null) return;
        if (!confirm("Disable stickiness for Load balancer " + elb.name+"?")) return;
        var me = this;

        if (elb.APolicyName == "") {
            var policy = elb.CPolicyName;
            this.core.api.DeleteLoadBalancerPolicy(elb.name,policy, function() { me.refresh(); });
        } else {
            var policy = elb.APolicyName;
            this.core.api.DeleteLoadBalancerPolicy(elb.name,policy, function() { me.refresh(); });
        }
    },

    applicationsticknesss :function(){
        var elb = this.getSelected();
        if (elb == null) return;
        var loadbalancername = elb.name;
        var cname = elb.CookieName;
        var policy = elb.APolicyName;
        if (cname){
            this.core.api.DeleteLoadBalancerPolicy(elb.name,policy);
        }
        var CookieName = prompt("Please provide your application cookie name:");
        if (CookieName == null) return;
        CookieName = CookieName.trim();
        if (!CookieName) {
            alert('Invalid cookie name.');
            return;
        }
        var me = this;
        this.core.api.CreateAppCookieSP(loadbalancername,CookieName,function() { me.refresh() });
    },

    loadbalancerstickness :function(){
        var elb = this.getSelected();
        if (elb == null) return;
        var loadbalancername = elb.name;
        var policy = elb.CPolicyName;
        var CookieExpirationPeriod = elb.CookieExpirationPeriod;
        if (CookieExpirationPeriod){
           this.core.api.DeleteLoadBalancerPolicy(elb.name,policy);
        }
        var CookieExpirationPeriod = prompt("Please provide your Cookie Expiration Period:");
        if (CookieExpirationPeriod == null) return;
        CookieExpirationPeriod = CookieExpirationPeriod.trim();

        if (!/^[0-9]+$/.test(CookieExpirationPeriod)) {
            alert('Cookie expiration period must be long integer.');
            return;
        }
        var me = this;
        this.core.api.CreateLBCookieSP(loadbalancername,CookieExpirationPeriod, function() { me.refresh(); });
    },

    menuChanged : function(){
        var elb = this.getSelected();
        if (elb == null) return;
        var menu = document.getElementById("loadbalancer.tree.contextmenu");
        document.getElementById("loadbalancer.context.appstickness").disabled = !elb.CookieName ? true : false;
        document.getElementById("loadbalancer.context.lbstickness").disabled = !elb.CookieExpirationPeriod ? true : false;
        if (!elb.CookieName && !elb.CookieExpirationPeriod) {
            document.getElementById("loadbalancer.context.disablestickness").disabled = true;
            document.getElementById("loadbalancer.context.lbstickness").disabled = false;
            document.getElementById("loadbalancer.context.appstickness").disabled = false;
        } else {
            document.getElementById("loadbalancer.context.disablestickness").disabled = false;
        }
        document.getElementById("loadbalancer.context.instances").disabled = elb.Instances.length == 0 ? true : false;
        document.getElementById("loadbalancer.context.disablezones").disabled = elb.zones.length > 1 ? false : true;
        document.getElementById("loadbalancer.context.enableezones").disabled = elb.vpcId != '' ? true : false;
        document.getElementById("loadbalancer.context.changegroups").disabled = elb.vpcId != '' ? false : true;

        document.getElementById("loadbalancer.context.addsubnet").disabled = elb.vpcId != '' ? false : true;
        document.getElementById("loadbalancer.context.delsubnet").disabled = elb.subnets && elb.subnets.length ? false : true;
    },

    changeSecurityGroup: function() {
        var me = this;
        var elb = this.getSelected();
        if (!elb) return;
        var groups = this.core.queryModel('securityGroups', 'vpcId', elb.vpcId);
        var list = this.core.promptList('Change Security Groups', 'Select security groups for load balancer:', groups, null, null, true);
        if (!list || !list.length) return;
        var me = this;
        groups = []
        for (var i in list) {
            groups.push(list[i].id)
        }
        this.core.api.applySecurityGroupsToLoadBalancer(elb.name, groups, function() { me.refresh();});
    },

    addSubnet: function()
    {
        var me = this;
        var elb = this.getSelected();
        if (!elb) return;
        var list = [];
        var subnets = this.core.queryModel('subnets', 'vpcId', elb.vpcId);
        for (var i in subnets) {
            if (elb.subnets.indexOf(subnets[i].id) >= 0) continue;
            list.push(subnets[i])
        }
        if (list.length == 0) {
            alert('No available subnets to attach to')
            return;
        }
        list = this.core.promptList('Attach to Subnets', 'Select subnets to attach this load balancer to', list, null, null, true);
        if (!list || !list.length) return;
        subnets = []
        for (var i in list) {
            subnets.push(list[i].id)
        }
        this.core.api.attachLoadBalancerToSubnets(elb.name, subnets, function() { me.refresh() });
    },

    deleteSubnet: function()
    {
        var me = this;
        var elb = this.getSelected();
        if (!elb || !elb.subnets || !elb.subnets.length) return;
        var list = [];
        var subnets = this.core.queryModel('subnets', 'vpcId', elb.vpcId);
        for (var i in subnets) {
            if (elb.subnets.indexOf(subnets[i].id) == -1) continue;
            list.push(subnets[i])
        }
        list = this.core.promptList('Detach from Subnets', 'Select subnets to dettach from this load balancer', list, null, null, true);
        if (!list || !list.length) return;
        subnets = []
        for (var i in list) {
            subnets.push(list[i].id)
        }
        this.core.api.dettachLoadBalancerFromSubnets(elb.name, subnets, function() { me.refresh() });
    },
};
ew_LoadbalancerTreeView.__proto__ = TreeView;

var ew_InstanceHealthTreeView = {
};
ew_InstanceHealthTreeView.__proto__ = TreeView;

var ew_AvailZoneTreeView = {
    model: 'availabilityZones',
};
ew_AvailZoneTreeView.__proto__ = TreeView;
