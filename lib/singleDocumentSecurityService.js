//stores the tenants and users ina  single document
var hasher = require('password-hash-and-salt');


var kwaaiSchema=require("kwaai-schema");
var mongo=require("mongodb");
var deepCopy=require("deepcopy");

var multiTenantTools=function(mainOptions){
    var _globalOptions=mainOptions;
    var kwaaiCrudware=require('kwaai-crudware').crudWare(mainOptions.db);
    var kwaaiCrud=require("kwaai-crud").crudTools(mainOptions.db);
    var kwaaiCrudwareUtils=require('kwaai-crudware').utils;

    this.addSecurityRoutes=function(app){
        app.get("/admin/" + _globalOptions.plural,kwaaiCrudwareUtils.onlyForRoles([_globalOptions.adminRole]),getTenantsByQuery);
        app.post("/admin/" + _globalOptions.plural,kwaaiCrudwareUtils.onlyForRoles([_globalOptions.adminRole]),checkTenantExists,createTenant);
        app.get("/:" +  _globalOptions.name + "/users",kwaaiCrudwareUtils.onlyForRoles([_globalOptions.tenantAdminRole]),getUsers);
        app.post("/:" + _globalOptions.name + "/users",kwaaiCrudwareUtils.onlyForRoles([_globalOptions.tenantAdminRole]),createUser);
        app.put("/:" + _globalOptions.name + "/users/:email",kwaaiCrudwareUtils.onlyForRoles([_globalOptions.tenantAdminRole]),updateUser);
        app.get("/:" + _globalOptions.name + "/users/:email",kwaaiCrudwareUtils.onlyForRoles([_globalOptions.tenantAdminRole]),getUser);
        app.delete("/:" + _globalOptions.name + "/users/:email",kwaaiCrudwareUtils.onlyForRoles([_globalOptions.tenantAdminRole]),deleteUser);
    }

    //********************************************************************************************************************************************
    //CREATE
    //*******************************************************************************************************************************************
    this.createTenant=createTenant;
    function createTenant(req,res,next){
        function passwordHashed(err,hash) {
            function tenantCreated(err, tenant) {
                if (err) {
                    return next(err)
                }
                return res.status(201).send(tenant);
            }

            var tenantToCreate=req.body;
            tenantToCreate.users=[
                {
                    email:req.body.adminUser.email,
                    password:hash,
                    roles:[_globalOptions.tenantAdminRole]
                }
            ]

            delete tenantToCreate.adminUser;
            kwaaiCrud.insert({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,data:tenantToCreate},tenantCreated)

        }
        var invalid=kwaaiSchema.validateToSchema(req.body,_globalOptions.schemas.create);
        if (invalid){return res.status(400).send(invalid);}

        //todo check if tenant name exists
        hasher(req.body.adminUser.password).hash(passwordHashed)
    }

    this.createUser=createUser;
    function createUser(req,res,next){
        function tenantRetrieved(err,tenant){
            if (err) {return next(err)}
            if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                _globalOptions.cache.del(_globalOptions.name + "_" + tenant.name);
            }

            function userAdded(err,addedTenant){
                if (err) {return next(err)}
                //console.log("User created");
                res.status(204).end();
            }

            if(!tenant){return res.status(404).send(_globalOptions.name + " not found.");}
            for (var i=0;i<tenant.users.length;i++){
                if (tenant.users[i].email.toLowerCase()==req.body.email.toLowerCase()){
                    return res.status(409).send("User exists");
                }
            }

            hasher(req.body.password).hash(function(error, hash) {

                var newUser={
                    email:req.body.email,
                    password:hash
                }

                if (req.body.roles){newUser.roles=req.body.roles}
                if (req.body.additionalInfo){newUser.additionalInfo=req.body.additionalInfo}

                tenant.users.push(newUser);

                kwaaiCrud.updateFull({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,id:tenant._id,data:tenant},userAdded)
            });
        }
        //console.log("creating new user...");
        var invalid=kwaaiSchema.validateToSchema(req.body,_globalOptions.schemas.user)
        if (invalid){return res.status(400).send(invalid)}

        kwaaiCrud.getById({collection: _globalOptions.tenantsCollection, id:req[_globalOptions.name]._id}, tenantRetrieved)
    }

    //********************************************************************************************************************************************
    //READ
    //*******************************************************************************************************************************************
    this.getTenantById=getTenantById;
    function getTenantById(req,res,next){
        req.kwaaioptions={
            collection:_globalOptions.tenantsCollection,
            sendresponse:true
        }

        kwaaiCrudware.getById(req,res,next);
    }

    this.getTenantsByQuery=getTenantsByQuery;
    function getTenantsByQuery(req,res,next){
      req.kwaaioptions={
            collection:_globalOptions.tenantsCollection,
            sendresponse:true
        }

        kwaaiCrudware.getByQuery(req,res,next);
    }

    this.checkTenantExists=checkTenantExists;
    function checkTenantExists(req,res,next){
        function tenantRetrieved(err,tenant){
            if (err){return next(err)}
            if (tenant&&tenant.length>0){return res.status(409).send(_globalOptions.name + " name exists");}
            next();
        }

        if (req.params.id){
            if (!mongo.ObjectID.isValid(req.params.id)){return next("invalid tenant id");}
            kwaaiCrud.getByQuery({collection: _globalOptions.tenantsCollection, rawQuery: {find:{"name": req.body.name.toLowerCase(),_id:{$ne:new mongo.ObjectID(req.params.id)}}}}, tenantRetrieved)
        }else {
            kwaaiCrud.getByQuery({collection: _globalOptions.tenantsCollection, rawQuery: {find:{"name": req.body.name.toLowerCase()}}}, tenantRetrieved)
        }
    }

    this.getUsers=getUsers;
    function getUsers(req,res,next){
        function tenantRetrieved(err,tenant){
            if (err) {return next(err)}
            if (!tenant){return res.status(404).send("tenant not found")}
            for (var i=0;i<tenant.users.length;i++){
                delete tenant.users[i].password;
            }
            return res.status(200).send(tenant.users);
        }
        getTenantbyName(req[_globalOptions.name].name,tenantRetrieved);
    }

    this.checkTenant=checkTenant;
    function checkTenant(req,res,next){
        function setTenanttoReq(err,tenant){
            if (err){return next(err)}
            if (tenant==null){return res.status(404).send("Invalid " + _globalOptions.name + " name")}

            //console.log("tenant " + tenant.name + " found");

            var tenantId=new mongo.ObjectID(tenant._id.toString());

            //todo active
            req[_globalOptions.name]={
                _id:tenantId,
                name:tenant.name
            }
            req.tenantId=tenantId.toString();

            req.body[_globalOptions.name+ "_id"]=tenantId;
            req.body[_globalOptions.name+ "_name"]=tenant.name;

            if (!req.query){req.query={}}

            req.query[_globalOptions.name+ "_id"]=tenantId;

            return next();
        }

        var tenantNameEnd = req.url.indexOf('/', 1);
        var tenantName="";
        if (tenantNameEnd==-1){
            tenantName = req.url.substring(1);
        }
        else {
            tenantName = req.url.substring(1, tenantNameEnd);
        }
        if (!tenantName||tenantName==""){return res.status(404).send("Invalid " + _globalOptions.name + " name")}

        //console.log("checking security for tenant " + tenantName);
        getTenantbyName(tenantName,setTenanttoReq)
    }

    this.checkUser=checkUser;
    //tenantName,userName,password
    function checkUser(options,callback){

        var userToVerify=null;

        function tenantRetrieved(err,tenant){

            function hashedChecked(error, verified){
                if (error) {console.error(error);return callback(error)}

                if (!verified){
                    console.log("user not verified:"+ currentUser.email);
                    return callback(null,null);
                } else {
                    console.log("user verified:"+ currentUser.email);
                    var copiedUser=deepCopy(userToVerify);
                    delete copiedUser.password;

                    return callback(null, copiedUser);
                }
            }

            if (err){return callback(err)}
            var found = false;
            var lowerUsername = options.userName.toLowerCase();
            for (var i=0;i<tenant.users.length;i++){
                var currentUser=tenant.users[i];
                if (currentUser.email==lowerUsername){
                    //console.log("found user " + currentUser.email);
                    found = true;
                    userToVerify = currentUser;
                    hasher(options.password).verifyAgainst(currentUser.password,hashedChecked);
                    break;
                }
            }
            if (!found){
                console.log("no user found" + currentUser.email);
                return callback(null,null);
            }
        }

        getTenantbyName(options.tenantName,tenantRetrieved)
    }

    this.getTenantbyName= getTenantbyName;
    function getTenantbyName(name,callback){
        function cacheChecked(err,value){
            if (!err&&value){
                return callback(null,value);
            }

            function tenantRetrieved(err,tenants){
                if (err){return callback(err)}
                if(!tenants){return callback(null,null)}
                if(tenants.length==0){return callback(null,null)}

                if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                    tenants[0]._id =tenants[0]._id.toString();

                    _globalOptions.cache.set(_globalOptions.name + "_" + name,tenants[0]);
                }

                return callback(null,tenants[0])
            }

            kwaaiCrud.getByQuery({collection:_globalOptions.tenantsCollection,query:{"name":name.toLowerCase()}},tenantRetrieved)
        }

        if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
            _globalOptions.cache.get(_globalOptions.name + "_" + name,cacheChecked);
        }
        else{
            cacheChecked(null,null)
        }


    }

    this.getUser=getUser;
    function getUser(req,res,next){
        function tenantRetrieved(err,tenant){
            if (err){return next(err);}
            if (!tenant){return res.status(404).send("Tenant not found");}
            var foundUser=null;
            var found = false;
            var lowerUsername = req.params.email.toLowerCase();
            for (var i=0;i<tenant.users.length;i++){
                var currentUser=tenant.users[i];
                if (currentUser.email==lowerUsername){
                    //console.log("found user " + currentUser.email);
                    found = true;
                    foundUser = currentUser;
                    break;
                }
            }
            if (!found){
                return res.status(404).send("User not found");
            }else{
                var copiedUser=deepCopy(foundUser);
                delete copiedUser.password;
                return res.status(200).send(copiedUser);
            }
        }

        getTenantbyName(req[_globalOptions.name].name,tenantRetrieved)
    }

    //********************************************************************************************************************************************
    //UPDATE
    //*******************************************************************************************************************************************

    this.updateTenantFull=updateTenantFull;
    function updateTenantFull(req,res,next){

        if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
            _globalOptions.cache.delKeys(_globalOptions.name + "_*");
        }

        req.kwaaioptions={
            collection:_globalOptions.tenantsCollection,
            schema:tenantSchema,
            sendresponse:true
        }

        kwaaiCrudware.updateFull(req,res,next);

    }

    this.updateTenantPart=updateTenantPart;
    function updateTenantPart(req,res,next){

        if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
            _globalOptions.cache.delKeys(_globalOptions.name + "_*");
        }

        req.kwaaioptions={
            collection:_globalOptions.tenantsCollection,
            schema:tenantSchema,
            sendresponse:true
        }

        kwaaiCrudware.updatePart(req,res,next);

    }

    this.addAdminTenant=addAdminTenant;
    function addAdminTenant(req,res,next){
       function adminRetrieved(err,adminTenant){
            if(err){return next(err)}
            req.body[_globalOptions.name + "_id"]=adminTenant._id;
            next();
        }
        getTenantbyName("admin",adminRetrieved)
    }

    this.resetPassword=resetPassword;
    function resetPassword(req,res,next){
        return next("Not implemented");
    }

    this.updatePassword=updatePassword;
    function updatePassword(req,res,next){
        return next("Not implemented");
    }

    this.updateUser=updateUser;
    function updateUser(req,res,next){
        function tenantRetrieved(err,tenant){
            if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                _globalOptions.cache.del(_globalOptions.name + "_" + req[_globalOptions.name].name);
            }

            if (err) {return next(err)}
            if (!tenant){return res.status(404).send("Tenant not found");}

            function userUpdated(err,result){
                if (err) {return next(err)}
                if (result==0){return res.status(304).end();}
                res.status(204).end();
            }

            var foundUser=-1;
            for (var i=0;i<tenant.users.length;i++){
                if (tenant.users[i].email.toLowerCase()==req.params.email.toLowerCase()){
                    foundUser=i;
                    break;
                }
            }
            if (foundUser==-1){return res.status(404).send("user not found.");}


            //check if e-mail changed
            if (tenant.users[foundUser].email.toLowerCase()!=req.body.email.toLowerCase()){
                for (var i=0;i<tenant.users.length;i++){
                    if (i!=foundUser&&tenant.users[i].email.toLowerCase()==req.body.email.toLowerCase()){
                        return res.status(409).send("email exists for user.")
                    }
                }
            }

            //check not hacking in super admin
            if (req.body.roles){
                for (var i=0;i<req.body.roles.length;i++){
                    if (req.body.roles==_globalOptions.adminRole){
                        return next("Unable to set roles");
                    }
                }
            }

            tenant.users[foundUser]={
                email:(req.body.email? req.body.email:req.params.email.toLowerCase()),
                password:tenant.users[foundUser].password,
                roles:req.body.roles
            };
            if (req.body.additionalInfo){tenant.users[foundUser].additionalInfo=req.body.additionalInfo;}

            kwaaiCrud.updateFull({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,id:tenant._id,data:tenant},userUpdated)
        }

        var invalid=kwaaiSchema.validateToSchema(req.body,_globalOptions.schemas.user)
        if (invalid){return res.send(400,invalid)}
        getTenantbyName(req[_globalOptions.name].name,tenantRetrieved);

    }
    //********************************************************************************************************************************************
    //DELETE
    //*******************************************************************************************************************************************

    this.deleteTenant=deleteTenant;
    function deleteTenant(req,res,next){
        if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
            _globalOptions.cache.delKeys(_globalOptions.name + "_*");
        }

        req.kwaaioptions={
            collection:_globalOptions.tenantsCollection,
            sendresponse:true
        }

        kwaaiCrudware.delete(req,res,next);
    }

    this.deleteUser=deleteUser;
    function deleteUser(req,res,next){
        function tenantRetrieved(err,tenant){
            if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                _globalOptions.cache.del(_globalOptions.name + "_" + req[_globalOptions.name].name);
            }

            if (err) {return next(err)}
            if (!tenant){return res.status(404).send("Tenant not found");}

            function userDeleted(err){
                if (err) {return next(err)}
                res.status(204).end();
            }



            var foundUser=-1;
            for (var i=0;i<tenant.users.length;i++){
                if (tenant.users[i].email.toLowerCase()==req.params.email.toLowerCase()){
                    foundUser=i;
                    break;
                }
            }
            if (foundUser==-1){return res.send(404,"user not found.")}
            tenant.users.splice(foundUser,1);

            kwaaiCrud.updateFull({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,id:tenant._id,data:tenant},userDeleted)
        }
        getTenantbyName(req[_globalOptions.name].name,tenantRetrieved);
    }

}


module.exports= function(options){
    return new multiTenantTools(options);
}
